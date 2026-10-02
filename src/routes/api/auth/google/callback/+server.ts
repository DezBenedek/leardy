import { redirect, type RequestHandler } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { createSession, ensureAuthSchema, getDb, type DbUser } from '$lib/server/db';
import {
	ALLOWED_DOMAIN,
	exchangeCodeForTokens,
	fetchGoogleProfile,
	getGoogleEnv,
	roleFromEmail,
	validateGoogleProfile,
	type GoogleEnv
} from '$lib/server/google-auth';

const STATE_COOKIE = 'leardy_oauth_state';

/* Google callback: e-mail + school_id + név mentése, session indítása. */
export const GET: RequestHandler = async (event) => {
	const fail = (code: string): never => {
		event.cookies.delete(STATE_COOKIE, { path: '/' });
		throw redirect(303, `/?auth_error=${code}`);
	};

	const code = event.url.searchParams.get('code')?.trim();
	const returnedState = event.url.searchParams.get('state')?.trim();
	const expectedState = event.cookies.get(STATE_COOKIE)?.trim();
	if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
		return fail('state');
	}

	const env = {
		...((privateEnv ?? {}) as GoogleEnv),
		...((event.platform?.env ?? {}) as GoogleEnv)
	};
	const creds = getGoogleEnv(env);
	if (!creds) return fail('config');

	const db = getDb(event);
	if (!db) return fail('db');
	await ensureAuthSchema(db);
	await ensureAuthColumns(db);

	const redirectUri = new URL('/api/auth/google/callback', event.url.origin).toString();

	let email = '';
	let name = '';
	let sub = '';
	let school_id = '';
	try {
		const accessToken = await exchangeCodeForTokens({
			code,
			clientId: creds.clientId,
			clientSecret: creds.clientSecret,
			redirectUri
		});
		const profile = await fetchGoogleProfile(accessToken);
		const valid = validateGoogleProfile(profile);
		email = valid.email;
		name = valid.name;
		sub = valid.sub;
		school_id = valid.school_id;
	} catch (err) {
		const msg = err instanceof Error ? err.message : '';
		if (msg.includes(`@${ALLOWED_DOMAIN}`)) return fail('domain');
		console.error('[leardy] Google callback hiba', err);
		return fail('google');
	}

	const now = Date.now();
	const existing = await db
		.prepare(
			`SELECT id, name, email,
				COALESCE(role, 'student') AS role, COALESCE(xp, 0) AS xp,
				COALESCE(streak, 0) AS streak, COALESCE(is_admin, 0) AS is_admin
			 FROM users WHERE email = ?`
		)
		.bind(email)
		.first<DbUser & { role: string; xp: number; streak: number; is_admin: number }>();

	let userId: string;
	const expectedRole = roleFromEmail(email);
	if (existing) {
		userId = existing.id;
		if (existing.name !== name) {
			await db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, userId).run().catch(() => {});
		}
		if (existing.role !== expectedRole) {
			await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(expectedRole, userId).run().catch(() => {});
		}
		await updateAuthColumns(db, userId, sub, school_id);
	} else {
		userId = crypto.randomUUID();
		await db
			.prepare(
				'INSERT INTO users (id, name, email, school_id, pass_hash, salt, created_at, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(userId, name, email, school_id, 'google-oauth', '', now, expectedRole)
			.run();
		await updateAuthColumns(db, userId, sub, school_id);
	}

	await createSession(event, db, userId);
	event.cookies.delete(STATE_COOKIE, { path: '/' });
	throw redirect(303, '/');
};

async function ensureAuthColumns(db: {
	prepare: (q: string) => { run: () => Promise<unknown> };
}): Promise<void> {
	for (const ddl of [
		'ALTER TABLE users ADD COLUMN google_sub TEXT',
		`ALTER TABLE users ADD COLUMN school_id TEXT NOT NULL DEFAULT ''`
	]) {
		try {
			await db.prepare(ddl).run();
		} catch {
			// oszlop már létezik
		}
	}
}

async function updateAuthColumns(
	db: {
		prepare: (q: string) => { bind: (...v: string[]) => { run: () => Promise<unknown> } };
	},
	userId: string,
	sub: string,
	school_id: string
): Promise<void> {
	try {
		await db
			.prepare('UPDATE users SET google_sub = ?, school_id = ? WHERE id = ?')
			.bind(sub, school_id, userId)
			.run();
	} catch {
		// régi séma
	}
}

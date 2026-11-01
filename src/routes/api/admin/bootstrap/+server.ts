import { error, json, type RequestHandler } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { getDb } from '$lib/server/infra/db';
import { ensureAdminSchema } from '$lib/server/admin/guards';

/* Egyszeri bootstrap: az első fejlesztő beállítása SQL nélkül.
   Feltétel: még nincs developer szerep, és a kérésben az ADMIN_SETUP_KEY szerepel.
   A kulcs secret: `wrangler secret put ADMIN_SETUP_KEY`, helyben .dev.vars. */

function setupKey(event: Parameters<RequestHandler>[0]): string | null {
	const fromPrivate = (privateEnv as Record<string, string | undefined> | undefined)?.ADMIN_SETUP_KEY?.trim();
	if (fromPrivate) return fromPrivate;
	try {
		const fromPlatform = (event.platform?.env as Record<string, string | undefined> | undefined)?.ADMIN_SETUP_KEY?.trim();
		if (fromPlatform) return fromPlatform;
	} catch {
		// nincs platform környezet
	}
	return null;
}

async function sameSecret(a: string, b: string): Promise<boolean> {
	try {
		const enc = new TextEncoder();
		const [da, db] = await Promise.all([
			crypto.subtle.digest('SHA-256', enc.encode(a)),
			crypto.subtle.digest('SHA-256', enc.encode(b))
		]);
		const xa = new Uint8Array(da);
		const xb = new Uint8Array(db);
		if (xa.length !== xb.length) return false;
		let diff = 0;
		for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ xb[i];
		return diff === 0;
	} catch {
		return a === b;
	}
}

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) error(503, 'Az adatbázis most nem elérhető.');
	await ensureAdminSchema(db);
	const devs = await db
		.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'developer'`)
		.first<{ n: number }>()
		.catch(() => ({ n: 1 }));
	if ((devs?.n ?? 1) > 0) error(403, 'Már van fejlesztő a rendszerben.');
	const key = setupKey(event);
	if (!key) error(403, 'Nincs beállítva a telepítési kulcs. Kérd a rendszergazdát.');
	let body: { email?: unknown; setupKey?: unknown };
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Hibás kérés.');
	}
	const email = String(body.email ?? '').trim().toLowerCase().slice(0, 254);
	const given = String(body.setupKey ?? '');
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error(400, 'Adj meg érvényes e-mail-címet.');
	if (!(await sameSecret(given, key))) error(403, 'Érvénytelen telepítési kulcs.');
	const target = await db
		.prepare(`SELECT id, role FROM users WHERE lower(email) = ?`)
		.bind(email)
		.first<{ id: string; role: string }>();
	if (!target) error(404, 'Ezzel az e-mail-címmel nincs regisztrált felhasználó. Lépj be előbb Google fiókkal.');
	await db
		.prepare(`UPDATE users SET role = 'developer', is_admin = 1 WHERE id = ?`)
		.bind(target.id)
		.run();
	await db
		.prepare(`INSERT INTO admin_actions (id, actor_id, target_id, action, reason, expires_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)`)
		.bind(crypto.randomUUID(), target.id, target.id, 'role:developer', 'bootstrap', Date.now())
		.run()
		.catch(() => {});
	return json({ ok: true });
};

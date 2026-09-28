import type { D1Database } from '@cloudflare/workers-types';
import type { RequestEvent } from '@sveltejs/kit';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

export interface DbUser {
	id: string;
	name: string;
	email: string;
	pass_hash: string;
	salt: string;
	created_at: number;
	role?: string;
	xp?: number;
	streak?: number;
	is_admin?: number;
}

export interface PublicUser {
	id: string;
	name: string;
	email: string;
	role: string;
	xp: number;
	streak: number;
	is_admin: number;
}

export const SESSION_COOKIE = 'leardy_session';
const SESSION_DAYS = 30;

export function getDb(event: RequestEvent): D1Database | null {
	try {
		return event.platform?.env?.DB ?? null;
	} catch {
		return null;
	}
}

/**
 * Önhelyreállító auth-séma: CSAK users + sessions.
 * A CREATE TABLE IF NOT EXISTS idempotens, élesben is biztonságos.
 * A régi (bővítetlen) users táblákhoz az ALTER-ek adják hozzá a hiányzó oszlopokat.
 */
export async function ensureAuthSchema(db: D1Database): Promise<void> {
	await db.batch([
		db.prepare(
			`CREATE TABLE IF NOT EXISTS users (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				email TEXT NOT NULL UNIQUE,
				pass_hash TEXT NOT NULL,
				salt TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				role TEXT NOT NULL DEFAULT 'student',
				xp INTEGER NOT NULL DEFAULT 0,
				streak INTEGER NOT NULL DEFAULT 0,
				last_study_date TEXT NOT NULL DEFAULT '',
				is_admin INTEGER NOT NULL DEFAULT 0
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS sessions (
				token TEXT PRIMARY KEY,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				created_at INTEGER NOT NULL,
				expires_at INTEGER NOT NULL
			)`
		),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`)
	]);
	// Meglévő (régi sémájú) users tábla bővítése. Ha az oszlop már létezik, a D1 hibát dob, azt elnyeljük.
	for (const ddl of [
		`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'`,
		`ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE users ADD COLUMN streak INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE users ADD COLUMN last_study_date TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`
	]) {
		try {
			await db.prepare(ddl).run();
		} catch {
			// oszlop már létezik
		}
	}
}

export function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Komoly jelszó-hash scrypt-tel. Formátum: scrypt$N$r$p$saltHex$keyHex.
 *  A régi SHA-256 hash-ek nem ellenőrizhetők vele, ez a hard cutover. */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

function scryptKey(password: string, salt: Buffer, keylen: number, N: number, r: number, p: number): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scryptCb(password, salt, keylen, { N, r, p }, (err, key) => {
			if (err) reject(err);
			else resolve(key as Buffer);
		});
	});
}

export async function hashPasswordScrypt(password: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await scryptKey(password, salt, SCRYPT_KEYLEN, SCRYPT_N, SCRYPT_R, SCRYPT_P);
	return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('hex'), key.toString('hex')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	try {
		const parts = String(stored ?? '').split('$');
		if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
		const N = Number(parts[1]);
		const r = Number(parts[2]);
		const p = Number(parts[3]);
		if (![N, r, p].every((n) => Number.isInteger(n) && n > 0 && n < 1_000_000)) return false;
		const salt = Buffer.from(parts[4], 'hex');
		const expected = Buffer.from(parts[5], 'hex');
		if (salt.length !== 16 || expected.length === 0) return false;
		const key = await scryptKey(password, salt, expected.length, N, r, p);
		return key.length === expected.length && timingSafeEqual(key, expected);
	} catch {
		return false;
	}
}

export function publicUser(u: DbUser): PublicUser {
	return {
		id: u.id,
		name: u.name,
		email: u.email,
		role: (u as Partial<PublicUser>).role ?? 'student',
		xp: (u as Partial<PublicUser>).xp ?? 0,
		streak: (u as Partial<PublicUser>).streak ?? 0,
		is_admin: (u as Partial<PublicUser>).is_admin ?? 0
	};
}

function secureCookie(event: RequestEvent): boolean {
	try {
		return new URL(event.request.url).protocol === 'https:';
	} catch {
		return false;
	}
}

export async function createSession(
	event: RequestEvent,
	db: D1Database,
	userId: string
): Promise<string> {
	const token = randomToken();
	const now = Date.now();
	await db
		.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
		.bind(token, userId, now, now + SESSION_DAYS * 24 * 3600 * 1000)
		.run();
	event.cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: secureCookie(event),
		maxAge: SESSION_DAYS * 24 * 3600
	});
	return token;
}

export async function getSessionUser(
	event: RequestEvent,
	db: D1Database
): Promise<PublicUser | null> {
	const token = event.cookies.get(SESSION_COOKIE);
	if (!token) return null;
	const row = await db
		.prepare(
			`SELECT u.id, u.name, u.email,
				COALESCE(u.role, 'student') AS role,
				COALESCE(u.xp, 0) AS xp,
				COALESCE(u.streak, 0) AS streak,
				COALESCE(u.is_admin, 0) AS is_admin
			 FROM sessions s
			 JOIN users u ON u.id = s.user_id
			 WHERE s.token = ? AND s.expires_at > ?`
		)
		.bind(token, Date.now())
		.first<PublicUser>();
	return row ?? null;
}

/** Bejelentkezett user, vagy null. Minden védett végpont belépési pontja. */
export async function requireUser(
	event: RequestEvent,
	db: D1Database
): Promise<PublicUser | null> {
	return getSessionUser(event, db);
}

export async function destroySession(event: RequestEvent, db: D1Database): Promise<void> {
	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
	}
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
}

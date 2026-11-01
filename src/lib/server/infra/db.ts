import type { D1Database } from '@cloudflare/workers-types';
import type { RequestEvent } from '@sveltejs/kit';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

export interface DbUser {
	id: string;
	name: string;
	email: string;
	school_id?: string;
	google_sub?: string | null;
	pass_hash: string;
	salt: string;
	created_at: number;
	role?: string;
	xp?: number;
	streak?: number;
	is_admin?: number;
	suspended_until?: number;
	muted_until?: number;
	suspended_reason?: string;
	muted_reason?: string;
}

export interface PublicUser {
	id: string;
	name: string;
	email: string;
	school_id: string;
	role: string;
	xp: number;
	streak: number;
	is_admin: number;
	suspended_until?: number;
	muted_until?: number;
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
 * Példányonként cache-elt, állandósult állapotban 3 D1-kör: batch + PRAGMA + index.
 */
export async function ensureAuthSchema(db: D1Database): Promise<void> {
	return cachedEnsure(db, 'auth', () => ensureAuthSchemaOnce(db));
}

/**
 * Példányonkénti ensure-cache: ugyanaz a DB-objektum egy kérésen vagy
 * cron-futáson belül egy ensure-t csak egyszer futtat le. A séma az
 * isolate életében nem változik, hibánál a bejegyzés törlődik.
 */
const ensureCache = new WeakMap<object, Map<string, Promise<void>>>();

export function cachedEnsure(db: D1Database, name: string, run: () => Promise<void>): Promise<void> {
	let byName = ensureCache.get(db);
	if (!byName) {
		byName = new Map();
		ensureCache.set(db, byName);
	}
	const pending = byName.get(name);
	if (pending) return pending;
	const task = run().catch((error) => {
		if (byName.get(name) === task) byName.delete(name);
		throw error;
	});
	byName.set(name, task);
	return task;
}

/** Egy tábla hiányzó oszlopai egyetlen PRAGMA-lekérdezésből. */
export async function missingColumns(db: D1Database, table: string, columns: string[]): Promise<string[]> {
	const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
	const have = new Set((info.results ?? []).map((column) => column.name));
	return columns.filter((column) => !have.has(column));
}

async function ensureAuthSchemaOnce(db: D1Database): Promise<void> {
	await db.batch([
		db.prepare(
			`CREATE TABLE IF NOT EXISTS users (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				email TEXT NOT NULL UNIQUE,
				school_id TEXT NOT NULL DEFAULT '',
				google_sub TEXT,
				pass_hash TEXT NOT NULL DEFAULT 'google-oauth',
				salt TEXT NOT NULL DEFAULT '',
				created_at INTEGER NOT NULL,
				role TEXT NOT NULL DEFAULT 'student',
				xp INTEGER NOT NULL DEFAULT 0,
				streak INTEGER NOT NULL DEFAULT 0,
				last_study_date TEXT NOT NULL DEFAULT '',
				is_admin INTEGER NOT NULL DEFAULT 0,
				suspended_until INTEGER NOT NULL DEFAULT 0,
				muted_until INTEGER NOT NULL DEFAULT 0,
				suspended_reason TEXT NOT NULL DEFAULT '',
				muted_reason TEXT NOT NULL DEFAULT ''
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
	// Meglévő (régi sémájú) users tábla bővítése, csak a valóban hiányzó oszlopokkal.
	// Egy PRAGMA-lekérdezés dönti el, állandósult állapotban nincs ALTER-kör.
	const userAdditions: [string, string][] = [
		['role', `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'`],
		['xp', `ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0`],
		['streak', `ALTER TABLE users ADD COLUMN streak INTEGER NOT NULL DEFAULT 0`],
		['last_study_date', `ALTER TABLE users ADD COLUMN last_study_date TEXT NOT NULL DEFAULT ''`],
		['is_admin', `ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`],
		['google_sub', `ALTER TABLE users ADD COLUMN google_sub TEXT`],
		['school_id', `ALTER TABLE users ADD COLUMN school_id TEXT NOT NULL DEFAULT ''`],
		['suspended_until', `ALTER TABLE users ADD COLUMN suspended_until INTEGER NOT NULL DEFAULT 0`],
		['muted_until', `ALTER TABLE users ADD COLUMN muted_until INTEGER NOT NULL DEFAULT 0`],
		['suspended_reason', `ALTER TABLE users ADD COLUMN suspended_reason TEXT NOT NULL DEFAULT ''`],
		['muted_reason', `ALTER TABLE users ADD COLUMN muted_reason TEXT NOT NULL DEFAULT ''`]
	];
	const userColumns = new Map(userAdditions);
	for (const column of await missingColumns(db, 'users', [...userColumns.keys()])) {
		try {
			await db.prepare(userColumns.get(column) ?? '').run();
		} catch {
			// oszlop már létezik
		}
	}
	try {
		await db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id)`).run();
	} catch {
		// régi séma: index később, migrációból
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
		school_id: u.school_id ?? '',
		role: (u as Partial<PublicUser>).role ?? 'student',
		xp: (u as Partial<PublicUser>).xp ?? 0,
		streak: (u as Partial<PublicUser>).streak ?? 0,
		is_admin: (u as Partial<PublicUser>).is_admin ?? 0,
		suspended_until: (u as Partial<PublicUser>).suspended_until ?? 0,
		muted_until: (u as Partial<PublicUser>).muted_until ?? 0
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
	try {
		const row = await db
			.prepare(
				`SELECT u.id, u.name, u.email,
					COALESCE(u.school_id, '') AS school_id,
					COALESCE(u.role, 'student') AS role,
					COALESCE(u.xp, 0) AS xp,
					COALESCE(u.streak, 0) AS streak,
					COALESCE(u.is_admin, 0) AS is_admin,
					COALESCE(u.suspended_until, 0) AS suspended_until,
					COALESCE(u.muted_until, 0) AS muted_until
				 FROM sessions s
				 JOIN users u ON u.id = s.user_id
				 WHERE s.token = ? AND s.expires_at > ?`
			)
			.bind(token, Date.now())
			.first<PublicUser>();
		if (!row) return null;
		if ((row.suspended_until ?? 0) > Date.now()) return null;
		return row;
	} catch {
		// Régi séma a 0015-ös migráció előtt: tiltó oszlopok nélkül.
		const row = await db
			.prepare(
				`SELECT u.id, u.name, u.email,
					COALESCE(u.school_id, '') AS school_id,
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
}

/** Felfüggesztett munkamenet adatai: a tiltott fiók miért nem tud belépni. */
export async function getSuspendedSession(
	event: RequestEvent,
	db: D1Database
): Promise<{ name: string; reason: string; until: number } | null> {
	const token = event.cookies.get(SESSION_COOKIE);
	if (!token) return null;
	try {
		const row = await db
			.prepare(
				`SELECT u.name AS name,
					COALESCE(u.suspended_reason, '') AS reason,
					COALESCE(u.suspended_until, 0) AS until
				 FROM sessions s
				 JOIN users u ON u.id = s.user_id
				 WHERE s.token = ? AND s.expires_at > ? AND COALESCE(u.suspended_until, 0) > ?`
			)
			.bind(token, Date.now(), Date.now())
			.first<{ name: string; reason: string; until: number }>();
		return row ?? null;
	} catch {
		return null;
	}
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

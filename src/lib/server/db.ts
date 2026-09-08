import type { D1Database } from '@cloudflare/workers-types';
import type { RequestEvent } from '@sveltejs/kit';

export interface DbUser {
	id: string;
	name: string;
	email: string;
	pass_hash: string;
	salt: string;
	created_at: number;
}

export interface PublicUser {
	id: string;
	name: string;
	email: string;
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
 * Önhelyreállító séma: ha a lokális D1 fájl friss/wipelt (.wrangler/state törlődött),
 * a táblák akkor is létrejönnek, nem kell kézzel migrálni dev-ben.
 * A CREATE TABLE IF NOT EXISTS idempotens, élesben is biztonságos.
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
				created_at INTEGER NOT NULL
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
}

export function makeSalt(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string, salt: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(`${salt}::${password}`)
	);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function publicUser(u: DbUser): PublicUser {
	return { id: u.id, name: u.name, email: u.email };
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
			`SELECT u.id, u.name, u.email FROM sessions s
			 JOIN users u ON u.id = s.user_id
			 WHERE s.token = ? AND s.expires_at > ?`
		)
		.bind(token, Date.now())
		.first<PublicUser>();
	return row ?? null;
}

export async function destroySession(event: RequestEvent, db: D1Database): Promise<void> {
	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
	}
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
}

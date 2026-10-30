import type { D1Database } from '@cloudflare/workers-types';
import type { RequestEvent } from '@sveltejs/kit';
import { getDb, type PublicUser } from './db';

/* Publikus API kulcsok tanári fiókokhoz.
   Formátum: ld_<32 hex>. Tárolás: SHA-256 hash, prefix a listázáshoz.
   Jogosultság: a kulcs tulajdonosának jogai (saját csomagok + szerkeszthető tananyag). */

export const API_KEY_PREFIX = 'ld_';
export const API_KEY_HEADER = 'authorization';

export interface ApiKeyRow {
	id: string;
	user_id: string;
	name: string;
	prefix: string;
	key_hash: string;
	scopes_json: string;
	last_used_at: number | null;
	created_at: number;
	revoked_at: number | null;
}

export async function ensureApiKeysSchema(db: D1Database): Promise<void> {
	await db
		.prepare(
			`CREATE TABLE IF NOT EXISTS api_keys (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				name TEXT NOT NULL DEFAULT '',
				prefix TEXT NOT NULL DEFAULT '',
				key_hash TEXT NOT NULL,
				scopes_json TEXT NOT NULL DEFAULT '[]',
				last_used_at INTEGER,
				created_at INTEGER NOT NULL,
				revoked_at INTEGER
			)`
		)
		.run();
	try {
		await db.prepare(`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`).run();
	} catch {
		// index már létezik
	}
	try {
		await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`).run();
	} catch {
		// index már létezik
	}
}

function newId(prefix: string): string {
	const r = Math.random().toString(36).slice(2, 10);
	return `${prefix}-${Date.now().toString(36)}-${r}`;
}

export function newApiKeySecret(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
	return `${API_KEY_PREFIX}${hex}`;
}

export async function hashApiKey(secret: string): Promise<string> {
	const data = new TextEncoder().encode(secret);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function extractApiKeySecret(event: RequestEvent): string | null {
	const auth = event.request.headers.get('authorization') ?? '';
	if (auth.toLowerCase().startsWith('bearer ')) {
		const token = auth.slice(7).trim();
		if (token) return token;
	}
	const headerKey = event.request.headers.get('x-api-key')?.trim();
	if (headerKey) return headerKey;
	const queryKey = event.url.searchParams.get('api_key')?.trim();
	if (queryKey) return queryKey;
	return null;
}

export interface ApiAuth {
	user: PublicUser;
	keyId: string;
	keyName: string;
	via: 'api-key' | 'session';
}

export async function requireApiUser(event: RequestEvent, db: D1Database): Promise<ApiAuth | null> {
	const secret = extractApiKeySecret(event);
	if (!secret) {
		// Kulcs nélkül: munkamenet is elfogadott (böngészős teszteléshez).
		const token = event.cookies.get('leardy_session');
		if (!token) return null;
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
		if (!row) return null;
		return { user: row, keyId: '', keyName: '', via: 'session' };
	}
	if (!secret.startsWith(API_KEY_PREFIX) || secret.length < 12) return null;
	const keyHash = await hashApiKey(secret);
	const key = await db
		.prepare(
			`SELECT id, user_id, COALESCE(name, '') AS name, COALESCE(prefix, '') AS prefix,
				key_hash, COALESCE(scopes_json, '[]') AS scopes_json,
				last_used_at, created_at, revoked_at
			 FROM api_keys WHERE key_hash = ? LIMIT 1`
		)
		.bind(keyHash)
		.first<ApiKeyRow>();
	if (!key || key.revoked_at) return null;
	const user = await db
		.prepare(
			`SELECT id, name, email,
				COALESCE(school_id, '') AS school_id,
				COALESCE(role, 'student') AS role,
				COALESCE(xp, 0) AS xp,
				COALESCE(streak, 0) AS streak,
				COALESCE(is_admin, 0) AS is_admin
			 FROM users WHERE id = ?`
		)
		.bind(key.user_id)
		.first<PublicUser>();
	if (!user) return null;
	try {
		await db
			.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`)
			.bind(Date.now(), key.id)
			.run();
	} catch {
		// használati idő mentése nem kritikus
	}
	return { user, keyId: key.id, keyName: key.name, via: 'api-key' };
}

export function canUsePublicApi(user: PublicUser): boolean {
	return user.role === 'teacher' || !!user.is_admin;
}

export function publicKeyInfo(row: ApiKeyRow): {
	id: string;
	name: string;
	prefix: string;
	createdAt: number;
	lastUsedAt: number | null;
	revoked: boolean;
} {
	return {
		id: row.id,
		name: row.name,
		prefix: row.prefix || `${API_KEY_PREFIX}…`,
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
		revoked: !!row.revoked_at
	};
}

export async function getDbOrThrow(event: RequestEvent): Promise<D1Database> {
	const db = getDb(event);
	if (!db) throw new Error('Az adatbázis most nem elérhető.');
	return db;
}

export function maskSecret(secret: string): string {
	if (secret.length <= 12) return `${API_KEY_PREFIX}…`;
	return `${secret.slice(0, 7)}…${secret.slice(-4)}`;
}

export { newId as newApiKeyId };

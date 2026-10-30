import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import {
	canUsePublicApi,
	ensureApiKeysSchema,
	hashApiKey,
	newApiKeyId,
	newApiKeySecret,
	publicKeyInfo
} from '$lib/server/api-keys';

/* Saját API kulcsok kezelése (munkamenet + tanári szerep).
   GET → listázás, POST { name? } → létrehozás (a titok csak egyszer látszik). */

export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	if (!canUsePublicApi(user)) return json({ error: 'Az API kulcsokhoz tanári fiók kell.' }, { status: 403 });
	try {
		await ensureApiKeysSchema(db);
		const res = await db
			.prepare(
				`SELECT id, user_id, COALESCE(name, '') AS name, COALESCE(prefix, '') AS prefix,
					key_hash, COALESCE(scopes_json, '[]') AS scopes_json,
					last_used_at, created_at, revoked_at
				 FROM api_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 20`
			)
			.bind(user.id)
			.all();
		const keys = (res.results ?? []).map((row) =>
			publicKeyInfo(
				row as {
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
			)
		);
		return json({ keys });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült betölteni a kulcsokat.' },
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	if (!canUsePublicApi(user)) return json({ error: 'Az API kulcsokhoz tanári fiók kell.' }, { status: 403 });
	let body: { name?: string };
	try {
		body = await event.request.json();
	} catch {
		body = {};
	}
	const name = (body.name ?? '').toString().trim().slice(0, 60) || 'API kulcs';
	try {
		await ensureApiKeysSchema(db);
		const existing = await db
			.prepare(`SELECT COUNT(*) AS n FROM api_keys WHERE user_id = ? AND revoked_at IS NULL`)
			.bind(user.id)
			.first<{ n: number }>();
		if ((existing?.n ?? 0) >= 10) {
			return json({ error: 'Legfeljebb 10 aktív kulcsod lehet. Előbb vonj vissza egyet.' }, { status: 400 });
		}
		const secret = newApiKeySecret();
		const keyHash = await hashApiKey(secret);
		const id = newApiKeyId('key');
		const now = Date.now();
		const prefix = `ld_${keyHash.slice(0, 6)}…`;
		await db
			.prepare(
				`INSERT INTO api_keys (id, user_id, name, prefix, key_hash, scopes_json, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(id, user.id, name, prefix, keyHash, '[]', now)
			.run();
		return json({
			key: { ...publicKeyInfo({ id, user_id: user.id, name, prefix, key_hash: keyHash, scopes_json: '[]', last_used_at: null, created_at: now, revoked_at: null }) },
			secret,
			warning: 'A kulcsot most másold ki, később nem jelenik meg újra.'
		});
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült létrehozni a kulcsot.' },
			{ status: 500 }
		);
	}
};

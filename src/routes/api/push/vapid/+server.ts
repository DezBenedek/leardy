import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb } from '$lib/server/db';
import { getVapidPublicKey } from '$lib/server/push';

/* Nyilvanos VAPID kulcs a bongeszos feliratkozashoz. Bejelentkezes sem kell hozza. */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	try {
		return json({ publicKey: await getVapidPublicKey(db) });
	} catch {
		return json({ error: 'A push szolgáltatás most nem elérhető.' }, { status: 500 });
	}
};

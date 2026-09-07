import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, getSessionUser } from '$lib/server/db';

export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await getSessionUser(event, db);
	if (!user) return json({ error: 'Nincs bejelentkezve.' }, { status: 401 });
	return json({ user });
};

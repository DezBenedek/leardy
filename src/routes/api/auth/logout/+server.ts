import { json, type RequestHandler } from '@sveltejs/kit';
import { destroySession, getDb } from '$lib/server/db';

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (db) await destroySession(event, db);
	return json({ ok: true });
};

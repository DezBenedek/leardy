import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';

// POST /api/classrooms/join { code } — csatlakozás kód alapján.
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let body: { code?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const code = String(body.code ?? '').trim().toUpperCase();
	const room = await db.prepare(`SELECT id FROM classrooms WHERE code = ?`).bind(code).first<{ id: string }>();
	if (!room) return json({ error: 'Nincs ilyen kódú osztály.' }, { status: 404 });
	await db
		.prepare(`INSERT OR IGNORE INTO classroom_members (classroom_id, user_id, joined_at) VALUES (?, ?, ?)`)
		.bind(room.id, user.id, Date.now())
		.run();
	return json({ ok: true });
};

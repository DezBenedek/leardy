import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';

// DELETE /api/messages/[id] — saját osztályüzenet törlése (tanár).
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const row = await db
		.prepare(
			`SELECT m.id FROM messages m JOIN classrooms c ON c.id = m.classroom_id
			 WHERE m.id = ? AND c.teacher_id = ?`
		)
		.bind(id, user.id)
		.first();
	if (!row) return json({ error: 'Nincs ilyen üzeneted.' }, { status: 404 });
	await db.prepare(`DELETE FROM messages WHERE id = ?`).bind(id).run();
	return json({ ok: true });
};

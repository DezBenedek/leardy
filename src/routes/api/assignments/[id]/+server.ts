import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';

// DELETE /api/assignments/[id] — kiadás visszavonása (tanár, saját osztály; beadásokkal együtt).
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	if (user.role !== 'teacher') return json({ error: 'Csak tanár vonhat vissza.' }, { status: 403 });
	const id = event.params.id ?? '';
	const row = await db
		.prepare(
			`SELECT a.id FROM assignments a JOIN classrooms c ON c.id = a.classroom_id
			 WHERE a.id = ? AND c.teacher_id = ?`
		)
		.bind(id, user.id)
		.first();
	if (!row) return json({ error: 'Nincs ilyen kiadásod.' }, { status: 404 });
	await db.batch([
		db.prepare(`DELETE FROM submissions WHERE assignment_id = ?`).bind(id),
		db.prepare(`DELETE FROM assignments WHERE id = ?`).bind(id)
	]);
	return json({ ok: true });
};

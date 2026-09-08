import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';

// DELETE /api/assessment-items/[id] — kérdés törlése a saját dolgozatból.
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const row = await db
		.prepare(
			`SELECT i.assessment_id AS a FROM assessment_items i
			 JOIN assessments s ON s.id = i.assessment_id
			 WHERE i.id = ? AND s.teacher_id = ?`
		)
		.bind(id, user.id)
		.first<{ a: string }>();
	if (!row) return json({ error: 'Nincs ilyen kérdésed.' }, { status: 404 });
	await db.prepare(`DELETE FROM assessment_items WHERE id = ?`).bind(id).run();
	return json({ ok: true });
};

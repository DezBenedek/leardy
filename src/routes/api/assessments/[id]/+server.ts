import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';

// GET /api/assessments/[id] — saját dolgozat kérdésekkel (tanár).
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const asm = await db
		.prepare(
			`SELECT s.id, s.title, s.topic_id, t.title AS topic_title, s.max_attempts, s.time_limit_mins,
				s.shuffle, s.feedback_delayed, s.is_exam
			 FROM assessments s LEFT JOIN topics t ON t.id = s.topic_id
			 WHERE s.id = ? AND s.teacher_id = ?`
		)
		.bind(id, user.id)
		.first();
	if (!asm) return json({ error: 'Nincs ilyen dolgozatod.' }, { status: 404 });
	const items = await db
		.prepare(
			`SELECT id, question_text, type, options_json, correct_answer FROM assessment_items
			 WHERE assessment_id = ? ORDER BY order_index`
		)
		.bind(id)
		.all();
	return json({ assessment: asm, items: items.results ?? [] });
};

// DELETE /api/assessments/[id] — saját dolgozat törlése (csak ha még nincs kiadva).
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const asm = await db
		.prepare(`SELECT id FROM assessments WHERE id = ? AND teacher_id = ?`)
		.bind(id, user.id)
		.first();
	if (!asm) return json({ error: 'Nincs ilyen dolgozatod.' }, { status: 404 });
	const used = await db
		.prepare(`SELECT COUNT(*) AS c FROM assignments WHERE assessment_id = ?`)
		.bind(id)
		.first<{ c: number }>();
	if ((used?.c ?? 0) > 0) {
		return json({ error: 'Már ki van adva — előbb vond vissza a kiadást.' }, { status: 409 });
	}
	await db.batch([
		db.prepare(`DELETE FROM assessment_items WHERE assessment_id = ?`).bind(id),
		db.prepare(`DELETE FROM assessments WHERE id = ?`).bind(id)
	]);
	return json({ ok: true });
};

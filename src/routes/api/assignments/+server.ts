import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, newId, requireUser } from '$lib/server/db';

// GET /api/assignments — az én házijaim/dolgozataim minden osztályomból.
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const rows = await db
		.prepare(
			`SELECT a.id, s.title, c.name AS classroom_name, a.due_date, s.time_limit_mins,
				s.max_attempts, s.is_exam, s.feedback_delayed,
				(SELECT COUNT(*) FROM submissions sm WHERE sm.assignment_id = a.id AND sm.student_id = ? AND sm.submitted_at > 0) AS attempts,
				(SELECT MAX(sm.score) FROM submissions sm WHERE sm.assignment_id = a.id AND sm.student_id = ? AND sm.submitted_at > 0) AS best
			 FROM assignments a
			 JOIN assessments s ON s.id = a.assessment_id
			 JOIN classrooms c ON c.id = a.classroom_id
			 LEFT JOIN classroom_members m ON m.classroom_id = c.id AND m.user_id = ?
			 WHERE c.teacher_id = ? OR m.user_id = ?
			 ORDER BY a.due_date`
		)
		.bind(user.id, user.id, user.id, user.id, user.id)
		.all<{
			id: string; title: string; classroom_name: string; due_date: number; time_limit_mins: number;
			max_attempts: number; is_exam: number; feedback_delayed: number; attempts: number; best: number | null;
		}>();
	return json({
		assignments: (rows.results ?? []).map((a) => ({ ...a, submitted: a.attempts > 0 ? 1 : 0 }))
	});
};

// POST /api/assignments { assessment_id, classroom_id, due_date } — kiadás (tanár, saját osztály).
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	if (user.role !== 'teacher') return json({ error: 'Kiadni csak tanár tud.' }, { status: 403 });
	let body: { assessment_id?: unknown; classroom_id?: unknown; due_date?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const assessment_id = String(body.assessment_id ?? '');
	const classroom_id = String(body.classroom_id ?? '');
	const due_date = Number(body.due_date ?? 0) || 0;
	const room = await db
		.prepare(`SELECT id FROM classrooms WHERE id = ? AND teacher_id = ?`)
		.bind(classroom_id, user.id)
		.first();
	if (!room) return json({ error: 'Nem a te osztályod.' }, { status: 403 });
	const asm = await db
		.prepare(`SELECT id FROM assessments WHERE id = ? AND teacher_id = ?`)
		.bind(assessment_id, user.id)
		.first();
	if (!asm) return json({ error: 'Nincs ilyen dolgozatod.' }, { status: 404 });
	const id = newId();
	await db
		.prepare(`INSERT INTO assignments (id, assessment_id, classroom_id, start_date, due_date) VALUES (?, ?, ?, ?, ?)`)
		.bind(id, assessment_id, classroom_id, Date.now(), due_date)
		.run();
	return json({ assignment: { id } }, { status: 201 });
};

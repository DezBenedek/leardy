import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';

// GET /api/classrooms/[id] — osztály + házik/határidők/dolgozatok + tagok.
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const room = await db
		.prepare(`SELECT id, name, code, teacher_id FROM classrooms WHERE id = ?`)
		.bind(id)
		.first<{ id: string; name: string; code: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	const member = await db
		.prepare(`SELECT 1 AS x FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
		.bind(id, user.id)
		.first();
	if (room.teacher_id !== user.id && !member) {
		return json({ error: 'Nem vagy tagja ennek az osztálynak.' }, { status: 403 });
	}
	const assigns = await db
		.prepare(
			`SELECT a.id, s.title, a.due_date, s.time_limit_mins, s.max_attempts, s.is_exam, s.feedback_delayed,
				(SELECT COUNT(*) FROM submissions sm WHERE sm.assignment_id = a.id AND sm.student_id = ? AND sm.submitted_at > 0) AS attempts,
				(SELECT COUNT(*) FROM submissions sm WHERE sm.assignment_id = a.id AND sm.student_id = ? AND sm.submitted_at > 0) AS submitted,
				(SELECT MAX(sm.score) FROM submissions sm WHERE sm.assignment_id = a.id AND sm.student_id = ? AND sm.submitted_at > 0) AS best
			 FROM assignments a JOIN assessments s ON s.id = a.assessment_id
			 WHERE a.classroom_id = ? ORDER BY a.due_date`
		)
		.bind(user.id, user.id, user.id, id)
		.all();
	const members = await db
		.prepare(
			`SELECT u.name FROM classroom_members m JOIN users u ON u.id = m.user_id
			 WHERE m.classroom_id = ? ORDER BY u.name LIMIT 50`
		)
		.bind(id)
		.all<{ name: string }>();
	return json({
		classroom: { id: room.id, name: room.name, code: room.code, mine: room.teacher_id === user.id ? 1 : 0 },
		assignments: (assigns.results ?? []).map((a) => ({
			...a,
			classroom_name: room.name,
			submitted: (a as { submitted: number }).submitted > 0 ? 1 : 0
		})),
		members: members.results ?? []
	});
};

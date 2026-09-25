import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';

// GET /api/assignments/[id]/results — kiadott feladat/dolgozat élő állása (csak a saját osztály tanára).
// Soronként: próbálkozások, legjobb pont, utolsó beadás + épp tölti-e (be nem adott kezdés).
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const a = await db
		.prepare(
			`SELECT a.id, a.classroom_id, a.due_date, a.max_attempts, a.time_limit_mins, a.is_exam,
				COALESCE(a.min_score, 0) AS min_score, s.title, c.name AS classroom_name, c.teacher_id,
				(SELECT COUNT(*) FROM assessment_items i WHERE i.assessment_id = a.assessment_id) AS questions
			 FROM assignments a
			 JOIN assessments s ON s.id = a.assessment_id
			 JOIN classrooms c ON c.id = a.classroom_id
			 WHERE a.id = ?`
		)
		.bind(id)
		.first<{
			id: string; classroom_id: string; due_date: number; max_attempts: number;
			time_limit_mins: number; is_exam: number; min_score: number; title: string;
			classroom_name: string; teacher_id: string; questions: number;
		}>();
	if (!a) return json({ error: 'Nincs ilyen kiadás.' }, { status: 404 });
	const mine = a.teacher_id === user.id;
	const superadmin = (user.is_admin ?? 0) === 1;
	if (!mine && !superadmin) return json({ error: 'Nincs jogosultságod.' }, { status: 403 });
	const rows = await db
		.prepare(
			`SELECT m.user_id AS id, u.name,
				COALESCE(SUM(CASE WHEN s.submitted_at > 0 THEN 1 ELSE 0 END), 0) AS attempts,
				MAX(CASE WHEN s.submitted_at > 0 THEN s.score END) AS best,
				MAX(CASE WHEN s.submitted_at > 0 THEN s.submitted_at END) AS last_submit,
				MAX(CASE WHEN s.submitted_at = 0 THEN s.started_at END) AS open_since
			 FROM classroom_members m
			 JOIN users u ON u.id = m.user_id
			 LEFT JOIN submissions s ON s.assignment_id = ? AND s.student_id = m.user_id
			 WHERE m.classroom_id = ?
			 GROUP BY m.user_id, u.name
			 ORDER BY u.name`
		)
		.bind(id, a.classroom_id)
		.all<{
			id: string; name: string; attempts: number; best: number | null;
			last_submit: number | null; open_since: number | null;
		}>();
	return json({
		assignment: {
			id: a.id,
			title: a.title,
			classroom_id: a.classroom_id,
			classroom_name: a.classroom_name,
			due_date: a.due_date,
			max_attempts: a.max_attempts,
			time_limit_mins: a.time_limit_mins,
			is_exam: a.is_exam,
			min_score: a.min_score,
			questions: a.questions
		},
		rows: (rows.results ?? []).map((r) => ({
			id: r.id,
			name: r.name,
			attempts: r.attempts ?? 0,
			best: r.best,
			last_submit: r.last_submit,
			open_since: r.open_since
		}))
	});
};

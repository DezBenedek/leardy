import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, newId, requireUser, shuffle } from '$lib/server/db';
import { hideAnswer, toQuizQ, type QuizRow } from '$lib/server/study';

async function loadAssignment(db: NonNullable<ReturnType<typeof getDb>>, assignmentId: string) {
	return db
		.prepare(
			`SELECT a.id AS assignment_id, a.due_date, s.id AS assessment_id, s.title,
				s.max_attempts, s.time_limit_mins, s.shuffle, s.feedback_delayed, s.is_exam
			 FROM assignments a JOIN assessments s ON s.id = a.assessment_id
			 WHERE a.id = ?`
		)
		.bind(assignmentId)
		.first<{
			assignment_id: string; due_date: number; assessment_id: string; title: string;
			max_attempts: number; time_limit_mins: number; shuffle: number; feedback_delayed: number; is_exam: number;
		}>();
}

async function attempts(db: NonNullable<ReturnType<typeof getDb>>, assignmentId: string, studentId: string) {
	const r = await db
		.prepare(
			`SELECT COUNT(*) AS c FROM submissions WHERE assignment_id = ? AND student_id = ? AND submitted_at > 0`
		)
		.bind(assignmentId, studentId)
		.first<{ c: number }>();
	return r?.c ?? 0;
}

// POST /api/assignments/[id]/start — kitöltés indítása (próbálkozás-számlálás, kevert sorrend).
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const asm = await loadAssignment(db, event.params.id ?? '');
	if (!asm) return json({ error: 'Nincs ilyen feladat.' }, { status: 404 });
	if (asm.due_date > 0 && Date.now() > asm.due_date) {
		return json({ error: 'Lejárt a határidő.' }, { status: 410 });
	}
	if (asm.max_attempts > 0 && (await attempts(db, asm.assignment_id, user.id)) >= asm.max_attempts) {
		return json({ error: 'Elfogyott a próbálkozásaid száma.' }, { status: 403 });
	}
	const rows = await db
		.prepare(
			`SELECT id, question_text, type, options_json, correct_answer FROM assessment_items
			 WHERE assessment_id = ? ORDER BY order_index`
		)
		.bind(asm.assessment_id)
		.all<QuizRow>();
	let items = (rows.results ?? []).map(toQuizQ);
	if (asm.shuffle) items = shuffle(items);
	const submission_id = newId();
	await db
		.prepare(
			`INSERT INTO submissions (id, assignment_id, student_id, score, total, started_at, submitted_at, answers_json)
			 VALUES (?, ?, ?, 0, ?, ?, 0, '{}')`
		)
		.bind(submission_id, asm.assignment_id, user.id, items.length, Date.now())
		.run();
	return json({
		items: items.map(hideAnswer),
		submission_id,
		started_at: Date.now(),
		time_limit_mins: asm.time_limit_mins,
		title: asm.title
	});
};

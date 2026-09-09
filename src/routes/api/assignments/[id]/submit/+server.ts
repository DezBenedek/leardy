import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, logActivity, requireUser } from '$lib/server/db';
import { expandQuizQs, type QuizRow } from '$lib/server/study';

// POST /api/assignments/[id]/submit { submission_id, answers } — beadás + pontozás.
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let body: { submission_id?: unknown; answers?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const submission_id = String(body.submission_id ?? '');
	const answers = (body.answers ?? {}) as Record<string, string>;
	const sub = await db
		.prepare(
			`SELECT sm.id, sm.assignment_id, sm.submitted_at, a.due_date, a.feedback_delayed
			 FROM submissions sm
			 JOIN assignments a ON a.id = sm.assignment_id
			 WHERE sm.id = ? AND sm.student_id = ?`
		)
		.bind(submission_id, user.id)
		.first<{ id: string; assignment_id: string; submitted_at: number; due_date: number; feedback_delayed: number }>();
	if (!sub) return json({ error: 'Nincs ilyen kitöltés.' }, { status: 404 });
	if (sub.submitted_at > 0) return json({ error: 'Ezt már beadtad.' }, { status: 409 });
	const asm = await db
		.prepare(`SELECT assessment_id FROM assignments WHERE id = ?`)
		.bind(sub.assignment_id)
		.first<{ assessment_id: string }>();
	const items = await db
		.prepare(
			`SELECT id, question_text, type, options_json, correct_answer FROM assessment_items
			 WHERE assessment_id = ? ORDER BY order_index`
		)
		.bind(asm?.assessment_id ?? '')
		.all<QuizRow>();
	let score = 0;
	// Többpáros párosítós ugyanúgy bővül, mint indításkor (determinisztikus id-k).
	const results = expandQuizQs(items.results ?? []).map((it) => {
		const given = String(answers[it.id] ?? '').trim();
		const correct = given !== '' && given === it.correct_answer;
		if (correct) score++;
		return { id: it.id, correct, answer: it.correct_answer };
	});
	await db
		.prepare(
			`UPDATE submissions SET score = ?, total = ?, submitted_at = ?, answers_json = ? WHERE id = ?`
		)
		.bind(score, results.length, Date.now(), JSON.stringify(answers), submission_id)
		.run();
	await logActivity(db, user.id, score * 2, 0);
	const delayed = sub.feedback_delayed === 1 && sub.due_date > 0 && Date.now() < sub.due_date;
	if (delayed) {
		// Visszajelzés késleltetve: csak a beadás ténye látszik a határidőig.
		return json({ score: -1, total: results.length, delayed: true });
	}
	return json({ score, total: results.length, delayed: false, results });
};

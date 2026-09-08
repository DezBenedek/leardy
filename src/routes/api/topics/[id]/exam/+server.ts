import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser, shuffle } from '$lib/server/db';
import { toQuizQ, type QuizRow } from '$lib/server/study';

interface ExamQuizRow extends QuizRow {
	lesson_id: string;
}

// GET /api/topics/[id]/exam — összevont témazáró + legutóbbi kitöltés.
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	const id = event.params.id ?? '';
	const topic = await db
		.prepare(`SELECT id, title, type FROM topics WHERE id = ?`)
		.bind(id)
		.first<{ id: string; title: string; type: 'language' | 'general' }>();
	if (!topic) return json({ error: 'Nincs ilyen témakör.' }, { status: 404 });
	const rows = await db
		.prepare(
			`SELECT qq.id, qq.question_text, qq.type, qq.options_json, qq.correct_answer, l.id AS lesson_id
			 FROM quiz_questions qq JOIN lessons l ON l.id = qq.lesson_id
			 WHERE l.topic_id = ? ORDER BY l.order_index`
		)
		.bind(id)
		.all<ExamQuizRow>();
	const quiz = shuffle(
		(rows.results ?? []).map((r) => ({ ...toQuizQ(r), lesson_id: r.lesson_id, options_raw: r.options_json }))
	).slice(0, 20);
	const lessonRows = await db
		.prepare(`SELECT id, title FROM lessons WHERE topic_id = ? ORDER BY order_index`)
		.bind(id)
		.all<{ id: string; title: string }>();

	let last: {
		score: number;
		total: number;
		created_at: number;
		mistakes: { lesson_id: string; title: string; wrong: number; total: number }[];
	} | null = null;
	if (user) {
		const att = await db
			.prepare(
				`SELECT score, total, mistakes_json, created_at FROM exam_attempts
				 WHERE user_id = ? AND topic_id = ? ORDER BY created_at DESC LIMIT 1`
			)
			.bind(user.id, id)
			.first<{ score: number; total: number; mistakes_json: string; created_at: number }>();
		if (att) {
			let parsed: Record<string, { wrong?: number; total?: number }> = {};
			try {
				parsed = JSON.parse(att.mistakes_json) as typeof parsed;
			} catch {
				parsed = {};
			}
			const mistakes: { lesson_id: string; title: string; wrong: number; total: number }[] = [];
			for (const [lesson_id, m] of Object.entries(parsed)) {
				if (!m || (m.wrong ?? 0) <= 0) continue;
				const l = await db
					.prepare(`SELECT title FROM lessons WHERE id = ?`)
					.bind(lesson_id)
					.first<{ title: string }>();
				mistakes.push({
					lesson_id,
					title: l?.title ?? 'Törölt lecke',
					wrong: m.wrong ?? 0,
					total: m.total ?? 0
				});
			}
			last = { score: att.score, total: att.total, created_at: att.created_at, mistakes };
		}
	}
	return json({ topic, quiz, lessons: lessonRows.results ?? [], last });
};

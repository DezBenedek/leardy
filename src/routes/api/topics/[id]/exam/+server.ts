import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, shuffle } from '$lib/server/db';
import { toQuizQ, type QuizRow } from '$lib/server/study';

// GET /api/topics/[id]/exam — összevont témazáró gyakorlás a leckék kvízeiből (keverve).
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const id = event.params.id ?? '';
	const topic = await db
		.prepare(`SELECT id, title, type FROM topics WHERE id = ?`)
		.bind(id)
		.first<{ id: string; title: string; type: 'language' | 'general' }>();
	if (!topic) return json({ error: 'Nincs ilyen témakör.' }, { status: 404 });
	const rows = await db
		.prepare(
			`SELECT qq.id, qq.question_text, qq.type, qq.options_json, qq.correct_answer
			 FROM quiz_questions qq JOIN lessons l ON l.id = qq.lesson_id
			 WHERE l.topic_id = ? ORDER BY l.order_index`
		)
		.bind(id)
		.all<QuizRow>();
	const quiz = shuffle((rows.results ?? []).map(toQuizQ)).slice(0, 20);
	return json({ topic, quiz });
};

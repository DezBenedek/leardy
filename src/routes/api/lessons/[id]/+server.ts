import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { toQuizQ, type QuizRow } from '$lib/server/study';

// GET /api/lessons/[id] — a lecke 3 modulja: elmélet + kártyák + kvíz (+ saját haladás).
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	const id = event.params.id ?? '';
	const lesson = await db
		.prepare(
			`SELECT l.id, l.topic_id, l.title, l.description_markdown, t.title AS topic_title, t.type AS topic_type, t.category
			 FROM lessons l JOIN topics t ON t.id = l.topic_id WHERE l.id = ?`
		)
		.bind(id)
		.first<{
			id: string; topic_id: string; title: string; description_markdown: string;
			topic_title: string; topic_type: 'language' | 'general'; category: string;
		}>();
	if (!lesson) return json({ error: 'Nincs ilyen lecke.' }, { status: 404 });
	const cards = await db
		.prepare(
			`SELECT id, lesson_id, front_text, back_text, audio_url, image_url, ipa
			 FROM flashcards WHERE lesson_id = ? ORDER BY rowid`
		)
		.bind(id)
		.all();
	const quiz = await db
		.prepare(
			`SELECT id, question_text, type, options_json, correct_answer
			 FROM quiz_questions WHERE lesson_id = ? ORDER BY rowid`
		)
		.bind(id)
		.all<QuizRow>();
	let progress = { theory_done: 0, cards_done: 0, quiz_done: 0, quiz_best: 0 };
	if (user) {
		const p = await db
			.prepare(
				`SELECT theory_done, cards_done, quiz_done, quiz_best FROM lesson_progress
				 WHERE user_id = ? AND lesson_id = ?`
			)
			.bind(user.id, id)
			.first<typeof progress>();
		if (p) progress = p;
	}
	return json({
		lesson: { id: lesson.id, topic_id: lesson.topic_id, title: lesson.title, description_markdown: lesson.description_markdown },
		topic: { id: lesson.topic_id, title: lesson.topic_title, type: lesson.topic_type, category: lesson.category },
		cards: cards.results ?? [],
		quiz: (quiz.results ?? []).map(toQuizQ),
		progress
	});
};

import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';

// GET /api/cards/mine — a saját témaköreim kártyái + leckéim (tanári Kártyák oldalhoz).
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	if (user.role !== 'teacher') return json({ error: 'Tanári funkció.' }, { status: 403 });
	const topics = await db
		.prepare(
			`SELECT t.id, t.title, t.category, t.type, t.is_public,
				(SELECT COUNT(*) FROM lessons l WHERE l.topic_id = t.id) AS lessons
			 FROM topics t WHERE t.author_id = ? ORDER BY t.created_at DESC`
		)
		.bind(user.id)
		.all();
	const lessons = await db
		.prepare(
			`SELECT l.id, l.title, l.topic_id, t.title AS topic_title,
				(SELECT COUNT(*) FROM flashcards f WHERE f.lesson_id = l.id) AS cards
			 FROM lessons l JOIN topics t ON t.id = l.topic_id
			 WHERE t.author_id = ? ORDER BY t.created_at DESC, l.order_index`
		)
		.bind(user.id)
		.all();
	const cards = await db
		.prepare(
			`SELECT f.id, f.front_text, f.back_text, f.ipa, f.example, f.lesson_id, l.title AS lesson_title,
				l.topic_id, t.title AS topic_title
			 FROM flashcards f
			 JOIN lessons l ON l.id = f.lesson_id
			 JOIN topics t ON t.id = l.topic_id
			 WHERE t.author_id = ? ORDER BY t.created_at DESC, l.order_index, f.rowid
			 LIMIT 500`
		)
		.bind(user.id)
		.all();
	return json({
		topics: topics.results ?? [],
		lessons: lessons.results ?? [],
		cards: cards.results ?? []
	});
};

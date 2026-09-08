import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser, todayStr } from '$lib/server/db';

// GET /api/review/sources — felvett témakörök + leckék esedékes/total számlálókkal (gyakorlás-forrásválasztóhoz).
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });

	const n = await db
		.prepare(`SELECT COUNT(*) AS c FROM enrollments WHERE user_id = ?`)
		.bind(user.id)
		.first<{ c: number }>();
	if ((n?.c ?? 0) === 0) {
		await db
			.prepare(
				`INSERT OR IGNORE INTO enrollments (user_id, topic_id, enrolled_at)
				 SELECT ?, id, ? FROM topics WHERE is_public = 1`
			)
			.bind(user.id, Date.now())
			.run();
	}
	const rows = await db
		.prepare(
			`SELECT t.id AS topic_id, t.title AS topic_title, t.type AS topic_type,
				l.id AS lesson_id, l.title AS lesson_title, l.order_index,
				(SELECT COUNT(*) FROM flashcards f WHERE f.lesson_id = l.id) AS total,
				(SELECT COUNT(*) FROM flashcards f
				 LEFT JOIN user_progress p ON p.user_id = ? AND p.flashcard_id = f.id
				 WHERE f.lesson_id = l.id
				 AND (p.next_review_date IS NULL OR p.next_review_date = '' OR p.next_review_date <= ?)) AS due
			 FROM topics t
			 JOIN lessons l ON l.topic_id = t.id
			 JOIN enrollments e ON e.topic_id = t.id AND e.user_id = ?
			 ORDER BY t.title, l.order_index`
		)
		.bind(user.id, todayStr(), user.id)
		.all<{
			topic_id: string; topic_title: string; topic_type: 'language' | 'general';
			lesson_id: string; lesson_title: string; order_index: number; total: number; due: number;
		}>();
	const byTopic = new Map<
		string,
		{ id: string; title: string; type: 'language' | 'general'; lessons: { id: string; title: string; due: number; total: number }[] }
	>();
	for (const r of rows.results ?? []) {
		let t = byTopic.get(r.topic_id);
		if (!t) {
			t = { id: r.topic_id, title: r.topic_title, type: r.topic_type, lessons: [] };
			byTopic.set(r.topic_id, t);
		}
		t.lessons.push({ id: r.lesson_id, title: r.lesson_title, due: r.due, total: r.total });
	}
	return json({ topics: [...byTopic.values()] });
};

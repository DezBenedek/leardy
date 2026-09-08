import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';

// GET /api/topics/[id] — témakör + leckék + saját haladás + feliratkozás állapota.
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	const id = event.params.id ?? '';
	const topic = await db
		.prepare(`SELECT id, title, category, type, is_public FROM topics WHERE id = ?`)
		.bind(id)
		.first<{ id: string; title: string; category: string; type: 'language' | 'general'; is_public: number }>();
	if (!topic) return json({ error: 'Nincs ilyen témakör.' }, { status: 404 });
	if (!topic.is_public && topic && user === null) {
		return json({ error: 'Jelentkezz be!' }, { status: 401 });
	}
	const lessons = await db
		.prepare(
			`SELECT l.id, l.topic_id, l.order_index, l.title,
				${user ? 'COALESCE(p.theory_done,0) AS theory_done, COALESCE(p.cards_done,0) AS cards_done, COALESCE(p.quiz_done,0) AS quiz_done, COALESCE(p.quiz_best,0) AS quiz_best' : '0 AS theory_done, 0 AS cards_done, 0 AS quiz_done, 0 AS quiz_best'}
			 FROM lessons l ${user ? 'LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = ?' : ''}
			 WHERE l.topic_id = ? ORDER BY l.order_index, l.title`
		)
		.bind(...(user ? [user.id, id] : [id]))
		.all();
	let enrolled = false;
	if (user) {
		const e = await db
			.prepare(`SELECT 1 AS x FROM enrollments WHERE user_id = ? AND topic_id = ?`)
			.bind(user.id, id)
			.first();
		enrolled = !!e;
	}
	return json({ topic, lessons: lessons.results ?? [], enrolled });
};

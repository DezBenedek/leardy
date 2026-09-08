import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, newId, requireUser } from '$lib/server/db';
import { CATS, typeForCategory } from '$lib/server/study';

// POST /api/decks { title, category } — önálló (privát) kártyapakli témakör nélkül:
// létrehoz egy privát témakört + egy leckét, ahová rögtön lehet kártyázni.
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let body: { title?: unknown; category?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const title = String(body.title ?? '').trim();
	const category = CATS.includes(String(body.category)) ? String(body.category) : 'Angol';
	if (title.length < 2) return json({ error: 'Adj legalább 2 karakteres címet.' }, { status: 400 });
	const now = Date.now();
	const topicId = newId();
	const lessonId = newId();
	await db.batch([
		db.prepare(
			`INSERT INTO topics (id, title, category, type, is_public, author_id, created_at)
			 VALUES (?, ?, ?, ?, 0, ?, ?)`
		).bind(topicId, title, category, typeForCategory(category), user.id, now),
		db.prepare(
			`INSERT INTO lessons (id, topic_id, order_index, title, description_markdown, created_at)
			 VALUES (?, ?, 0, ?, '', ?)`
		).bind(lessonId, topicId, 'Pakli', now),
		db.prepare(`INSERT OR IGNORE INTO enrollments (user_id, topic_id, enrolled_at) VALUES (?, ?, ?)`).bind(
			user.id,
			topicId,
			now
		)
	]);
	return json({ topic_id: topicId, lesson_id: lessonId }, { status: 201 });
};

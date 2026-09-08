import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, newId, requireUser } from '$lib/server/db';
import { isTopicOwner } from '$lib/server/study';

// POST /api/topics/[id]/lessons — új lecke a saját témakörbe.
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const topicId = event.params.id ?? '';
	if (!(await isTopicOwner(db, topicId, user.id))) {
		return json({ error: 'Csak a saját témakörödet szerkesztheted.' }, { status: 403 });
	}
	let body: { title?: unknown; description_markdown?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const title = String(body.title ?? '').trim();
	if (title.length < 2) return json({ error: 'Adj legalább 2 karakteres címet.' }, { status: 400 });
	const max = await db
		.prepare(`SELECT COALESCE(MAX(order_index), -1) AS m FROM lessons WHERE topic_id = ?`)
		.bind(topicId)
		.first<{ m: number }>();
	const id = newId();
	await db
		.prepare(
			`INSERT INTO lessons (id, topic_id, order_index, title, description_markdown, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(id, topicId, (max?.m ?? -1) + 1, title, String(body.description_markdown ?? ''), Date.now())
		.run();
	return json({ lesson: { id, title } }, { status: 201 });
};

import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, newId, requireUser } from '$lib/server/db';
import { isTopicOwner, topicOfLesson } from '$lib/server/study';

// POST /api/lessons/[id]/cards — új kártya a saját leckébe.
// Nyelveknél az irány: front = idegen nyelvű (válasz), back = magyar (kérdés).
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const lessonId = event.params.id ?? '';
	const topicId = await topicOfLesson(db, lessonId);
	if (!topicId || !(await isTopicOwner(db, topicId, user.id))) {
		return json({ error: 'Csak a saját leckédet szerkesztheted.' }, { status: 403 });
	}
	let body: { front_text?: unknown; back_text?: unknown; ipa?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const front_text = String(body.front_text ?? '').trim();
	const back_text = String(body.back_text ?? '').trim();
	if (!front_text || !back_text) return json({ error: 'Kérdés és válasz is kell.' }, { status: 400 });
	const id = newId();
	await db
		.prepare(
			`INSERT INTO flashcards (id, lesson_id, front_text, back_text, audio_url, image_url, ipa)
			 VALUES (?, ?, ?, ?, NULL, NULL, ?)`
		)
		.bind(id, lessonId, front_text, back_text, String(body.ipa ?? '').trim() || null)
		.run();
	return json({ card: { id, front_text, back_text } }, { status: 201 });
};

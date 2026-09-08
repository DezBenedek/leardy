import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { isTopicOwner, toQuizQ, topicOfLesson, type QuizRow } from '$lib/server/study';

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
		quiz: (quiz.results ?? []).map((r) => ({ ...toQuizQ(r), options_raw: r.options_json })),
		progress
	});
};

// PATCH /api/lessons/[id] — saját lecke szerkesztése (cím, elmélet).
export const PATCH: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const topicId = await topicOfLesson(db, id);
	if (!topicId || !(await isTopicOwner(db, topicId, user.id))) {
		return json({ error: 'Csak a saját leckédet szerkesztheted.' }, { status: 403 });
	}
	let body: { title?: unknown; description_markdown?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const sets: string[] = [];
	const args: unknown[] = [];
	if (body.title !== undefined) {
		const title = String(body.title).trim();
		if (title.length < 2) return json({ error: 'Adj legalább 2 karakteres címet.' }, { status: 400 });
		sets.push('title = ?');
		args.push(title);
	}
	if (body.description_markdown !== undefined) {
		sets.push('description_markdown = ?');
		args.push(String(body.description_markdown));
	}
	if (sets.length === 0) return json({ error: 'Nincs mit menteni.' }, { status: 400 });
	await db.prepare(`UPDATE lessons SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
	return json({ ok: true });
};

// DELETE /api/lessons/[id] — saját lecke törlése (kártyákkal, kvízekkel).
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const topicId = await topicOfLesson(db, id);
	if (!topicId || !(await isTopicOwner(db, topicId, user.id))) {
		return json({ error: 'Csak a saját leckédet törölheted.' }, { status: 403 });
	}
	await db.batch([
		db.prepare(`DELETE FROM user_progress WHERE flashcard_id IN (SELECT id FROM flashcards WHERE lesson_id = ?)`).bind(id),
		db.prepare(`DELETE FROM lesson_progress WHERE lesson_id = ?`).bind(id),
		db.prepare(`DELETE FROM flashcards WHERE lesson_id = ?`).bind(id),
		db.prepare(`DELETE FROM quiz_questions WHERE lesson_id = ?`).bind(id),
		db.prepare(`DELETE FROM lessons WHERE id = ?`).bind(id)
	]);
	return json({ ok: true });
};

import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { CATS, isTopicOwner, typeForCategory } from '$lib/server/study';

// GET /api/topics/[id] — témakör + leckék + saját haladás + feliratkozás + szerzőiség.
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	const id = event.params.id ?? '';
	const topic = await db
		.prepare(`SELECT id, title, category, type, is_public, author_id FROM topics WHERE id = ?`)
		.bind(id)
		.first<{
			id: string; title: string; category: string; type: 'language' | 'general';
			is_public: number; author_id: string | null;
		}>();
	if (!topic) return json({ error: 'Nincs ilyen témakör.' }, { status: 404 });
	if (!topic.is_public && user === null) {
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
	const { author_id: _author, ...pub } = topic;
	return json({
		topic: pub,
		lessons: lessons.results ?? [],
		enrolled,
		mine: !!user && topic.author_id === user.id
	});
};

// PATCH /api/topics/[id] — saját témakör szerkesztése (cím, tantárgy, láthatóság).
export const PATCH: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if (!(await isTopicOwner(db, id, user.id))) {
		return json({ error: 'Csak a saját témakörödet szerkesztheted.' }, { status: 403 });
	}
	let body: { title?: unknown; category?: unknown; is_public?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const sets: string[] = [];
	const args: unknown[] = [];
	if (body.title !== undefined) {
		const title = String(body.title).trim();
		if (title.length < 3) return json({ error: 'Adj legalább 3 karakteres címet.' }, { status: 400 });
		sets.push('title = ?');
		args.push(title);
	}
	if (body.category !== undefined) {
		const category = String(body.category);
		if (!CATS.includes(category)) return json({ error: 'Hibás tantárgy.' }, { status: 400 });
		sets.push('category = ?', 'type = ?');
		args.push(category, typeForCategory(category));
	}
	if (body.is_public !== undefined) {
		sets.push('is_public = ?');
		args.push(body.is_public ? 1 : 0);
	}
	if (sets.length === 0) return json({ error: 'Nincs mit menteni.' }, { status: 400 });
	await db.prepare(`UPDATE topics SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
	return json({ ok: true });
};

// DELETE /api/topics/[id] — saját témakör törlése mindennel együtt.
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if (!(await isTopicOwner(db, id, user.id))) {
		return json({ error: 'Csak a saját témakörödet törölheted.' }, { status: 403 });
	}
	await db.batch([
		db.prepare(
			`DELETE FROM submissions WHERE assignment_id IN
			 (SELECT a.id FROM assignments a JOIN assessments s ON s.id = a.assessment_id WHERE s.topic_id = ?)`
		).bind(id),
		db.prepare(
			`DELETE FROM assessment_items WHERE assessment_id IN (SELECT id FROM assessments WHERE topic_id = ?)`
		).bind(id),
		db.prepare(
			`DELETE FROM assignments WHERE assessment_id IN (SELECT id FROM assessments WHERE topic_id = ?)`
		).bind(id),
		db.prepare(`DELETE FROM assessments WHERE topic_id = ?`).bind(id),
		db.prepare(
			`DELETE FROM user_progress WHERE flashcard_id IN
			 (SELECT f.id FROM flashcards f JOIN lessons l ON l.id = f.lesson_id WHERE l.topic_id = ?)`
		).bind(id),
		db.prepare(`DELETE FROM lesson_progress WHERE lesson_id IN (SELECT id FROM lessons WHERE topic_id = ?)`).bind(id),
		db.prepare(`DELETE FROM flashcards WHERE lesson_id IN (SELECT id FROM lessons WHERE topic_id = ?)`).bind(id),
		db.prepare(`DELETE FROM quiz_questions WHERE lesson_id IN (SELECT id FROM lessons WHERE topic_id = ?)`).bind(id),
		db.prepare(`DELETE FROM lessons WHERE topic_id = ?`).bind(id),
		db.prepare(`DELETE FROM enrollments WHERE topic_id = ?`).bind(id),
		db.prepare(`DELETE FROM topics WHERE id = ?`).bind(id)
	]);
	return json({ ok: true });
};

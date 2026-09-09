import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, newId, requireUser, shuffle } from '$lib/server/db';
import { buildAssessmentItems, langAdverb, type QuizRow } from '$lib/server/study';

// GET /api/assessments — a saját dolgozataim (tanár), feladatszámmal.
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	if (user.role !== 'teacher') return json({ error: 'Tanári funkció.' }, { status: 403 });
	const rows = await db
		.prepare(
			`SELECT s.id, s.title, s.topic_id, t.title AS topic_title, s.max_attempts, s.time_limit_mins,
				s.shuffle, s.feedback_delayed, s.is_exam, s.created_at,
				(SELECT COUNT(*) FROM assessment_items i WHERE i.assessment_id = s.id) AS items,
				(SELECT COUNT(*) FROM assignments a WHERE a.assessment_id = s.id) AS assigned
			 FROM assessments s LEFT JOIN topics t ON t.id = s.topic_id
			 WHERE s.teacher_id = ? ORDER BY s.created_at DESC`
		)
		.bind(user.id)
		.all();
	return json({ assessments: rows.results ?? [] });
};

// POST /api/assessments — tanári dolgozat háromféle forrásból (a témakör opcionális):
//  a) lesson_ids: a megadott leckék kvízeiből importál (témakör ilyenkor kell),
//  b) topic_id + count: a témakör szókincséből generál,
//  c) témakör nélkül: üres, egyedi kérdésekkel tölthető.
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	if (user.role !== 'teacher') return json({ error: 'Dolgozatot csak tanár állíthat össze.' }, { status: 403 });
	let body: {
		topic_id?: unknown; topic_ids?: unknown; title?: unknown; max_attempts?: unknown; time_limit_mins?: unknown;
		shuffle?: unknown; feedback_delayed?: unknown; is_exam?: unknown; count?: unknown;
		lesson_ids?: unknown;
	};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	// Több témakörből is generálhatunk (pl. dolgozat több kártyacsomagból).
	const topicIds = [
		...new Set(
			(Array.isArray(body.topic_ids) ? body.topic_ids : [])
				.map((x) => String(x))
				.filter(Boolean)
		)
	].slice(0, 10);
	const topic_id = topicIds[0] ?? String(body.topic_id ?? '');
	const title = String(body.title ?? '').trim();
	if (title.length < 3) return json({ error: 'Adj legalább 3 karakteres címet.' }, { status: 400 });
	let topic: { id: string; type: string; category: string } | null = null;
	if (topic_id) {
		topic = await db
			.prepare(`SELECT id, type, category FROM topics WHERE id = ?`)
			.bind(topic_id)
			.first<{ id: string; type: string; category: string }>();
		if (!topic) return json({ error: 'Nincs ilyen témakör.' }, { status: 404 });
	}
	// A további témaköröknek létezniük kell (csendben eldobjuk a többit).
	let extraIds: string[] = [];
	if (topic && topicIds.length > 1) {
		const found = await db
			.prepare(`SELECT id FROM topics WHERE id IN (${topicIds.slice(1).map(() => '?').join(',')})`)
			.bind(...topicIds.slice(1))
			.all<{ id: string }>();
		extraIds = (found.results ?? []).map((r) => r.id).filter((x) => x !== topic.id);
	}
	const lessonIds = Array.isArray(body.lesson_ids)
		? body.lesson_ids.map((x) => String(x)).filter(Boolean).slice(0, 30)
		: [];
	const wantsAuto = Number(body.count ?? 0) > 0 || body.count === undefined;
	if ((lessonIds.length > 0 || wantsAuto) && !topic) {
		return json({ error: 'Importhez és generáláshoz válassz témakört.' }, { status: 400 });
	}
	const id = newId();
	const max_attempts = Math.max(0, Math.min(20, Number(body.max_attempts ?? 0) || 0));
	const time_limit_mins = Math.max(0, Math.min(180, Number(body.time_limit_mins ?? 0) || 0));
	await db
		.prepare(
			`INSERT INTO assessments (id, teacher_id, topic_id, title, max_attempts, time_limit_mins, shuffle, feedback_delayed, is_exam, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id, user.id, topic ? topic.id : null, title, max_attempts, time_limit_mins,
			body.shuffle === false ? 0 : 1, body.feedback_delayed ? 1 : 0,
			body.is_exam ? 1 : 0, Date.now()
		)
		.run();

	let n = 0;
	if (lessonIds.length > 0 && topic) {
		// Import a kiválasztott leckék kvízeiből (pillanatkép-másolat, csak saját témakörből).
		const rows = await db
			.prepare(
				`SELECT qq.question_text, qq.type, qq.options_json, qq.correct_answer
				 FROM quiz_questions qq JOIN lessons l ON l.id = qq.lesson_id
				 WHERE l.topic_id = ? AND qq.lesson_id IN (${lessonIds.map(() => '?').join(',')})
				 ORDER BY l.order_index, qq.rowid`
			)
			.bind(topic_id, ...lessonIds)
			.all<QuizRow>();
		let i = 0;
		for (const r of shuffle(rows.results ?? []).slice(0, 50)) {
			await db
				.prepare(
					`INSERT INTO assessment_items (id, assessment_id, question_text, type, options_json, correct_answer, order_index)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(newId(), id, r.question_text, r.type, r.options_json, r.correct_answer, i++)
				.run();
			n++;
		}
		if (n === 0) {
			await db.prepare(`DELETE FROM assessments WHERE id = ?`).bind(id).run();
			return json({ error: 'A kiválasztott leckékben nincs kvízkérdés.' }, { status: 400 });
		}
	} else if ((Number(body.count ?? 0) > 0 || body.count === undefined) && topic) {
		n = await buildAssessmentItems(db, id, [topic.id, ...extraIds], topic.type, Number(body.count ?? 10) || 10, langAdverb(topic.category));
		if (n === 0) {
			await db.prepare(`DELETE FROM assessments WHERE id = ?`).bind(id).run();
			return json({ error: 'A témakörökben nincs kártya vagy kvíz, amiből generálhatnék.' }, { status: 400 });
		}
	}
	// count === 0 és nincs lesson_ids: üres, egyedi kérdésekkel tölthető.
	return json({ assessment: { id, title, items: n } }, { status: 201 });
};

import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, newId, requireUser } from '$lib/server/db';
import { buildAssessmentItems } from '$lib/server/study';

// POST /api/assessments — tanár: egyedi dolgozat/házi egy témakör szókincséből, automatikusan generálva.
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	if (user.role !== 'teacher') return json({ error: 'Dolgozatot csak tanár állíthat össze.' }, { status: 403 });
	let body: {
		topic_id?: unknown; title?: unknown; max_attempts?: unknown; time_limit_mins?: unknown;
		shuffle?: unknown; feedback_delayed?: unknown; is_exam?: unknown; count?: unknown;
	};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const topic_id = String(body.topic_id ?? '');
	const title = String(body.title ?? '').trim();
	if (!topic_id || title.length < 3) return json({ error: 'Témakör és legalább 3 karakteres cím kell.' }, { status: 400 });
	const topic = await db
		.prepare(`SELECT id, type FROM topics WHERE id = ?`)
		.bind(topic_id)
		.first<{ id: string; type: string }>();
	if (!topic) return json({ error: 'Nincs ilyen témakör.' }, { status: 404 });
	const id = newId();
	const max_attempts = Math.max(0, Math.min(20, Number(body.max_attempts ?? 0) || 0));
	const time_limit_mins = Math.max(0, Math.min(180, Number(body.time_limit_mins ?? 0) || 0));
	await db
		.prepare(
			`INSERT INTO assessments (id, teacher_id, topic_id, title, max_attempts, time_limit_mins, shuffle, feedback_delayed, is_exam, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id, user.id, topic_id, title, max_attempts, time_limit_mins,
			body.shuffle === false ? 0 : 1, body.feedback_delayed ? 1 : 0,
			body.is_exam ? 1 : 0, Date.now()
		)
		.run();
	const n = await buildAssessmentItems(db, id, topic_id, topic.type, Number(body.count ?? 10) || 10);
	if (n === 0) {
		await db.prepare(`DELETE FROM assessments WHERE id = ?`).bind(id).run();
		return json({ error: 'A témakörben nincs kártya vagy kvíz, amiből generálhatnék.' }, { status: 400 });
	}
	return json({ assessment: { id, title, items: n } }, { status: 201 });
};

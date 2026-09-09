import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, newId, requireUser } from '$lib/server/db';
import type { QuizRow } from '$lib/server/study';

// POST /api/assessments/merge { assessment_ids, title, ... } — több saját kvíz
// kérdéseinek összefésülése egy új feladatsorba (pl. dolgozat több kvízből).
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	if (user.role !== 'teacher') return json({ error: 'Tanári funkció.' }, { status: 403 });
	let body: {
		assessment_ids?: unknown; title?: unknown; max_attempts?: unknown; time_limit_mins?: unknown;
		shuffle?: unknown; feedback_delayed?: unknown; is_exam?: unknown;
	};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const ids = [...new Set((Array.isArray(body.assessment_ids) ? body.assessment_ids : []).map((x) => String(x)).filter(Boolean))].slice(0, 10);
	if (ids.length < 2) return json({ error: 'Válassz legalább két kvízt.' }, { status: 400 });
	const title = String(body.title ?? '').trim();
	if (title.length < 3) return json({ error: 'Adj legalább 3 karakteres címet.' }, { status: 400 });
	const owned = await db
		.prepare(`SELECT id FROM assessments WHERE teacher_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
		.bind(user.id, ...ids)
		.all<{ id: string }>();
	const ownedIds = new Set((owned.results ?? []).map((r) => r.id));
	if (!ids.every((x) => ownedIds.has(x))) {
		return json({ error: 'Csak a saját kvízeidet fésülheted össze.' }, { status: 403 });
	}
	const id = newId();
	const max_attempts = Math.max(0, Math.min(20, Number(body.max_attempts ?? 0) || 0));
	const time_limit_mins = Math.max(0, Math.min(180, Number(body.time_limit_mins ?? 0) || 0));
	await db
		.prepare(
			`INSERT INTO assessments (id, teacher_id, topic_id, title, max_attempts, time_limit_mins, shuffle, feedback_delayed, is_exam, created_at)
			 VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id, user.id, title, max_attempts, time_limit_mins,
			body.shuffle === false ? 0 : 1, body.feedback_delayed ? 1 : 0,
			body.is_exam ? 1 : 0, Date.now()
		)
		.run();
	let order = 0;
	for (const aid of ids) {
		const rows = await db
			.prepare(
				`SELECT question_text, type, options_json, correct_answer FROM assessment_items
				 WHERE assessment_id = ? ORDER BY order_index`
			)
			.bind(aid)
			.all<QuizRow>();
		for (const r of rows.results ?? []) {
			await db
				.prepare(
					`INSERT INTO assessment_items (id, assessment_id, question_text, type, options_json, correct_answer, order_index)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(newId(), id, r.question_text, r.type, r.options_json, r.correct_answer, order++)
				.run();
		}
	}
	if (order === 0) {
		await db.prepare(`DELETE FROM assessments WHERE id = ?`).bind(id).run();
		return json({ error: 'A kiválasztott kvízekben nincs kérdés.' }, { status: 400 });
	}
	return json({ assessment: { id, title, items: order } }, { status: 201 });
};

import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { isTopicOwner } from '$lib/server/study';

const TYPES = ['choice', 'text', 'match', 'order', 'tf'];

async function ownerQuestion(
	db: NonNullable<ReturnType<typeof getDb>>,
	qId: string,
	userId: string
): Promise<boolean> {
	const r = await db
		.prepare(
			`SELECT l.topic_id AS t FROM quiz_questions q JOIN lessons l ON l.id = q.lesson_id WHERE q.id = ?`
		)
		.bind(qId)
		.first<{ t: string }>();
	return !!r && isTopicOwner(db, r.t, userId);
}

function buildOptions(
	type: string,
	options: string[],
	left: string,
	correct: string
): { options_json: string; correct_answer: string } {
	if (type === 'match') {
		return {
			options_json: JSON.stringify({ left, options, answer: correct }),
			correct_answer: correct
		};
	}
	if (type === 'order') {
		return { options_json: JSON.stringify(options), correct_answer: JSON.stringify(options) };
	}
	if (type === 'tf') {
		return { options_json: '["Igaz","Hamis"]', correct_answer: correct === 'Hamis' ? 'Hamis' : 'Igaz' };
	}
	if (type === 'text') {
		return { options_json: '[]', correct_answer: correct };
	}
	return { options_json: JSON.stringify(options), correct_answer: correct };
}

// PATCH /api/questions/[id] — saját kvízkérdés szerkesztése.
export const PATCH: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if (!(await ownerQuestion(db, id, user.id))) {
		return json({ error: 'Csak a saját kérdésedet szerkesztheted.' }, { status: 403 });
	}
	let body: { question_text?: unknown; type?: unknown; options?: unknown; left?: unknown; correct_answer?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const cur = await db
		.prepare(`SELECT question_text, type, options_json, correct_answer FROM quiz_questions WHERE id = ?`)
		.bind(id)
		.first<{ question_text: string; type: string; options_json: string; correct_answer: string }>();
	if (!cur) return json({ error: 'Nincs ilyen kérdés.' }, { status: 404 });

	const question_text = body.question_text !== undefined ? String(body.question_text).trim() : cur.question_text;
	const type = body.type !== undefined && TYPES.includes(String(body.type)) ? String(body.type) : cur.type;
	let options: string[] = [];
	let left = '';
	let correct = body.correct_answer !== undefined ? String(body.correct_answer).trim() : cur.correct_answer;
	try {
		const p: unknown = JSON.parse(cur.options_json);
		if (type === 'match' && p && typeof p === 'object') {
			const m = p as { left?: string; options?: string[]; answer?: string };
			options = Array.isArray(m.options) ? m.options : [];
			left = m.left ?? '';
			if (body.correct_answer === undefined) correct = m.answer ?? correct;
		} else if (Array.isArray(p)) {
			options = p.filter((x): x is string => typeof x === 'string');
		}
	} catch {
		// sérült sor: üresből indulunk
	}
	if (body.options !== undefined && Array.isArray(body.options)) {
		options = body.options.map((o) => String(o).trim()).filter(Boolean);
	}
	if (body.left !== undefined) left = String(body.left).trim();
	if (!question_text) return json({ error: 'Kérdés szövege kell.' }, { status: 400 });
	const built = buildOptions(type, options, left, correct);
	await db
		.prepare(
			`UPDATE quiz_questions SET question_text = ?, type = ?, options_json = ?, correct_answer = ? WHERE id = ?`
		)
		.bind(question_text, type, built.options_json, built.correct_answer, id)
		.run();
	return json({ ok: true });
};

// DELETE /api/questions/[id] — saját kvízkérdés törlése.
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if (!(await ownerQuestion(db, id, user.id))) {
		return json({ error: 'Csak a saját kérdésedet törölheted.' }, { status: 403 });
	}
	await db.prepare(`DELETE FROM quiz_questions WHERE id = ?`).bind(id).run();
	return json({ ok: true });
};

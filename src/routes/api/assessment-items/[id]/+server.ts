import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';

const TYPES = ['choice', 'text', 'match', 'order', 'tf'];

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

async function ownerItem(
	db: NonNullable<ReturnType<typeof getDb>>,
	itemId: string,
	userId: string
): Promise<boolean> {
	const row = await db
		.prepare(
			`SELECT i.assessment_id AS a FROM assessment_items i
			 JOIN assessments s ON s.id = i.assessment_id
			 WHERE i.id = ? AND s.teacher_id = ?`
		)
		.bind(itemId, userId)
		.first<{ a: string }>();
	return !!row;
}

// PATCH /api/assessment-items/[id] — kérdés szerkesztése a saját dolgozatban.
export const PATCH: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if (!(await ownerItem(db, id, user.id))) {
		return json({ error: 'Nincs ilyen kérdésed.' }, { status: 404 });
	}
	let body: { question_text?: unknown; type?: unknown; options?: unknown; left?: unknown; correct_answer?: unknown; pairs?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const cur = await db
		.prepare(`SELECT question_text, type, options_json, correct_answer FROM assessment_items WHERE id = ?`)
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
	if (type === 'match') {
		const incomingPairs = Array.isArray(body.pairs)
			? (body.pairs as { left?: unknown; right?: unknown }[])
					.map((x) => ({ left: String(x?.left ?? '').trim(), right: String(x?.right ?? '').trim() }))
					.filter((x) => x.left && x.right)
					.slice(0, 12)
			: null;
		if (incomingPairs) {
			if (incomingPairs.length < 2) {
				return json({ error: 'Párosítóshoz legalább 2 kitöltött pár kell.' }, { status: 400 });
			}
			const built = { options_json: JSON.stringify({ pairs: incomingPairs }), correct_answer: incomingPairs[0].right };
			await db
				.prepare(`UPDATE assessment_items SET question_text = ?, type = ?, options_json = ?, correct_answer = ? WHERE id = ?`)
				.bind(question_text, type, built.options_json, built.correct_answer, id)
				.run();
			return json({ ok: true });
		}
	}
	if (type === 'match' && (!left || options.length < 2 || !correct)) {
		return json({ error: 'Párosítóshoz bal oldal, legalább 2 opció és helyes válasz kell.' }, { status: 400 });
	}
	if ((type === 'choice' || type === 'order') && options.length < 2) {
		return json({ error: 'Legalább 2 opció kell.' }, { status: 400 });
	}
	if ((type === 'choice' || type === 'text' || type === 'match') && !correct) {
		return json({ error: 'Helyes válasz kell.' }, { status: 400 });
	}
	const built = buildOptions(type, options, left, correct);
	await db
		.prepare(
			`UPDATE assessment_items SET question_text = ?, type = ?, options_json = ?, correct_answer = ? WHERE id = ?`
		)
		.bind(question_text, type, built.options_json, built.correct_answer, id)
		.run();
	return json({ ok: true });
};

// DELETE /api/assessment-items/[id] — kérdés törlése a saját dolgozatból.
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const row = await db
		.prepare(
			`SELECT i.assessment_id AS a FROM assessment_items i
			 JOIN assessments s ON s.id = i.assessment_id
			 WHERE i.id = ? AND s.teacher_id = ?`
		)
		.bind(id, user.id)
		.first<{ a: string }>();
	if (!row) return json({ error: 'Nincs ilyen kérdésed.' }, { status: 404 });
	await db.prepare(`DELETE FROM assessment_items WHERE id = ?`).bind(id).run();
	return json({ ok: true });
};

import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, newId, requireUser } from '$lib/server/db';

const TYPES = ['choice', 'text', 'match', 'order', 'tf'];

// POST /api/assessments/[id]/items — egyedi kérdés a saját dolgozatba.
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const asm = await db
		.prepare(`SELECT id FROM assessments WHERE id = ? AND teacher_id = ?`)
		.bind(id, user.id)
		.first();
	if (!asm) return json({ error: 'Nincs ilyen dolgozatod.' }, { status: 404 });
	let body: { question_text?: unknown; type?: unknown; options?: unknown; left?: unknown; correct_answer?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const question_text = String(body.question_text ?? '').trim();
	const type = TYPES.includes(String(body.type)) ? String(body.type) : 'choice';
	const options = Array.isArray(body.options)
		? body.options.map((o) => String(o).trim()).filter(Boolean)
		: [];
	const left = String(body.left ?? '').trim();
	const correct = String(body.correct_answer ?? '').trim();
	if (!question_text) return json({ error: 'Kérdés szövege kell.' }, { status: 400 });
	let options_json = JSON.stringify(options);
	if (type === 'match') {
		if (!left || options.length < 2 || !correct) {
			return json({ error: 'Párosítóshoz bal oldal, legalább 2 opció és helyes válasz kell.' }, { status: 400 });
		}
		options_json = JSON.stringify({ left, options, answer: correct });
	} else if (type === 'order') {
		if (options.length < 2) return json({ error: 'Sorrendhez legalább 2 elem kell.' }, { status: 400 });
		options_json = JSON.stringify(options);
		return await insertItem(db, id, question_text, type, options_json, JSON.stringify(options));
	} else if (type === 'tf') {
		options_json = '["Igaz","Hamis"]';
		return await insertItem(db, id, question_text, type, options_json, correct === 'Hamis' ? 'Hamis' : 'Igaz');
	} else if (type === 'text') {
		if (!correct) return json({ error: 'Helyes válasz kell.' }, { status: 400 });
		options_json = '[]';
	} else {
		if (options.length < 2 || !correct) {
			return json({ error: 'Legalább 2 opció és helyes válasz kell.' }, { status: 400 });
		}
	}
	return await insertItem(db, id, question_text, type, options_json, correct);
};

async function insertItem(
	db: NonNullable<ReturnType<typeof getDb>>,
	assessmentId: string,
	question_text: string,
	type: string,
	options_json: string,
	correct_answer: string
) {
	const max = await db
		.prepare(`SELECT COALESCE(MAX(order_index), -1) AS m FROM assessment_items WHERE assessment_id = ?`)
		.bind(assessmentId)
		.first<{ m: number }>();
	const itemId = newId();
	await db
		.prepare(
			`INSERT INTO assessment_items (id, assessment_id, question_text, type, options_json, correct_answer, order_index)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(itemId, assessmentId, question_text, type, options_json, correct_answer, (max?.m ?? -1) + 1)
		.run();
	return json({ item: { id: itemId } }, { status: 201 });
}

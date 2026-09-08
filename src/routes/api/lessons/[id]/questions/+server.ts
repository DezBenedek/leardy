import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, newId, requireUser } from '$lib/server/db';
import { isTopicOwner, topicOfLesson } from '$lib/server/study';

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

// POST /api/lessons/[id]/questions — új kvízkérdés a saját leckébe.
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
	if (type === 'match' && (!left || options.length < 2 || !correct)) {
		return json({ error: 'Párosítóshoz bal oldal, legalább 2 opció és helyes válasz kell.' }, { status: 400 });
	}
	if ((type === 'choice' || type === 'order') && (options.length < 2 || !correct)) {
		return json({ error: 'Legalább 2 opció és helyes válasz kell.' }, { status: 400 });
	}
	if (type === 'text' && !correct) return json({ error: 'Helyes válasz kell.' }, { status: 400 });
	const built = buildOptions(type, options, left, correct);
	const id = newId();
	await db
		.prepare(
			`INSERT INTO quiz_questions (id, lesson_id, question_text, type, options_json, correct_answer)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(id, lessonId, question_text, type, built.options_json, built.correct_answer)
		.run();
	return json({ question: { id } }, { status: 201 });
};

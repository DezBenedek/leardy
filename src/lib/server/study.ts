// Szerver-oldali study helperek: kvíz sorok -> kliens modell, dolgozat-generálás.
import type { D1Database } from '@cloudflare/workers-types';
import { newId, shuffle } from './db';

export interface QuizRow {
	id: string;
	question_text: string;
	type: string;
	options_json: string;
	correct_answer: string;
}

export interface QuizQ {
	id: string;
	question_text: string;
	type: string;
	options: string[];
	left?: string;
	correct_answer: string;
}

/** Adatsorból kliens-kvíz (opciók keverve — puskázás ellen). */
export function toQuizQ(r: QuizRow): QuizQ {
	if (r.type === 'match') {
		try {
			const o = JSON.parse(r.options_json) as { left?: string; options?: string[]; answer?: string };
			return {
				id: r.id,
				question_text: r.question_text,
				type: 'match',
				options: shuffle(o.options ?? []),
				left: o.left,
				correct_answer: o.answer ?? r.correct_answer
			};
		} catch {
			// sérült sor: üres kérdésként dobjuk
		}
	}
	let options: string[] = [];
	try {
		const p: unknown = JSON.parse(r.options_json);
		if (Array.isArray(p)) options = p.filter((x): x is string => typeof x === 'string');
	} catch {
		options = [];
	}
	if (r.type === 'text') {
		return { id: r.id, question_text: r.question_text, type: 'text', options: [], correct_answer: r.correct_answer };
	}
	return {
		id: r.id,
		question_text: r.question_text,
		type: 'choice',
		options: shuffle(options),
		correct_answer: r.correct_answer
	};
}

/** Megoldás levétele a kliensnek küldött kérdésről (éles dolgozat). */
export function hideAnswer(q: QuizQ): Omit<QuizQ, 'correct_answer'> {
	const { correct_answer: _ca, ...rest } = q;
	return rest;
}

/** Automatikus dolgozat-generálás egy témakör szókincséből/fogalmaiból. */
export async function buildAssessmentItems(
	db: D1Database,
	assessmentId: string,
	topicId: string,
	topicType: string,
	count: number
): Promise<number> {
	const cards = await db
		.prepare(
			`SELECT f.front_text, f.back_text FROM flashcards f
			 JOIN lessons l ON l.id = f.lesson_id WHERE l.topic_id = ?`
		)
		.bind(topicId)
		.all<{ front_text: string; back_text: string }>();
	const quizzes = await db
		.prepare(`SELECT qq.id, qq.question_text, qq.type, qq.options_json, qq.correct_answer FROM quiz_questions qq
			JOIN lessons l ON l.id = qq.lesson_id WHERE l.topic_id = ?`)
		.bind(topicId)
		.all<QuizRow>();
	const backs = (cards.results ?? []).map((c) => c.back_text);
	const items: { question_text: string; type: string; options_json: string; correct_answer: string }[] = [];
	for (const q of quizzes.results ?? []) {
		items.push({
			question_text: q.question_text,
			type: q.type,
			options_json: q.options_json,
			correct_answer: q.correct_answer
		});
	}
	for (const c of shuffle(cards.results ?? [])) {
		const distractors = shuffle(backs.filter((b) => b !== c.back_text)).slice(0, 3);
		const options = shuffle([c.back_text, ...distractors]);
		items.push({
			question_text: topicType === 'language' ? `Mit jelent: ${c.front_text}?` : c.front_text,
			type: 'choice',
			options_json: JSON.stringify(options),
			correct_answer: c.back_text
		});
	}
	const picked = shuffle(items).slice(0, Math.max(1, Math.min(count || 10, 50)));
	let i = 0;
	for (const it of picked) {
		await db
			.prepare(
				`INSERT INTO assessment_items (id, assessment_id, question_text, type, options_json, correct_answer, order_index)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(newId(), assessmentId, it.question_text, it.type, it.options_json, it.correct_answer, i++)
			.run();
	}
	return picked.length;
}

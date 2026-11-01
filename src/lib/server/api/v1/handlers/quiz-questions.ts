import { requireLevelEditor } from '$lib/server/curriculum/curriculum-editor';
import { levelIdForQuiz, optionsToJson } from '../level-lookup';
import { err, ok, readJson, strParam, newId, type RouteCtx } from '../http';

export async function handleQuizQuestions(ctx: RouteCtx): Promise<Response | null> {
	const { event, db, a, user, method, url, segments, head, second, third } = ctx;
	/* Kvízkérdések */
	if (head === 'quiz-questions' && method === 'GET' && !second) {
		const quizId = strParam(url, 'quizId') || strParam(url, 'quiz_id');
		if (!quizId) return err('Hiányzik a quizId.', 400);
		const res = await db
			.prepare(`SELECT id, quiz_id AS quizId, question_text AS questionText, COALESCE(type, 'choice') AS type, COALESCE(options_json, '[]') AS optionsJson, COALESCE(correct_answer, '') AS correctAnswer, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM quiz_questions WHERE quiz_id = ? ORDER BY sort, id LIMIT 500`)
			.bind(quizId)
			.all();
		return ok({ questions: res.results ?? [] });
	}
	if (head === 'quiz-questions' && method === 'POST' && !second) {
		const body = await readJson(event);
		const quizId = String(body.quizId ?? body.quiz_id ?? '').trim();
		const questionText = String(body.questionText ?? body.question_text ?? '').trim();
		if (!quizId) return err('Hiányzik a quizId.', 400);
		if (!questionText) return err('Add meg a kérdés szövegét.', 400);
		const levelId = await levelIdForQuiz(db, quizId);
		if (!levelId) return err('Nincs ilyen kvíz.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		const type = String(body.type ?? 'choice').trim() || 'choice';
		const optionsJson = typeof body.optionsJson === 'string' ? body.optionsJson : optionsToJson(type, body);
		const id = newId('qq');
		await db
			.prepare(`INSERT INTO quiz_questions (id, quiz_id, question_text, type, options_json, correct_answer, sort, section_slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
			.bind(id, quizId, questionText.slice(0, 5000), type.slice(0, 30), optionsJson.slice(0, 50000), String(body.correctAnswer ?? body.correct_answer ?? '').slice(0, 5000), Number(body.sort) || 0, String(body.sectionSlug ?? body.section_slug ?? '').trim().slice(0, 80))
			.run();
		return ok({ ok: true, id }, 201);
	}
	if (head === 'quiz-questions' && second) {
		if (method === 'GET') {
			const row = await db
				.prepare(`SELECT id, quiz_id AS quizId, question_text AS questionText, COALESCE(type, 'choice') AS type, COALESCE(options_json, '[]') AS optionsJson, COALESCE(correct_answer, '') AS correctAnswer, COALESCE(section_slug, '') AS sectionSlug FROM quiz_questions WHERE id = ?`)
				.bind(second)
				.first();
			if (!row) return err('Nincs ilyen kérdés.', 404);
			return ok({ question: row });
		}
		const qrow = await db.prepare(`SELECT quiz_id AS quizId FROM quiz_questions WHERE id = ?`).bind(second).first<{ quizId: string }>().catch(() => null);
		if (!qrow) return err('Nincs ilyen kérdés.', 404);
		const levelId = await levelIdForQuiz(db, qrow.quizId);
		if (!levelId) return err('Nincs ilyen kvíz.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		if (method === 'PATCH') {
			const body = await readJson(event);
			const sets: string[] = [];
			const args: (string | number)[] = [];
			if (body.questionText !== undefined || body.question_text !== undefined) {
				const t = String(body.questionText ?? body.question_text ?? '').trim();
				if (!t) return err('A kérdés szövege nem lehet üres.', 400);
				sets.push('question_text = ?');
				args.push(t.slice(0, 5000));
			}
			if (body.type !== undefined) {
				sets.push('type = ?');
				args.push(String(body.type).slice(0, 30));
			}
			if (body.options !== undefined || body.answers !== undefined || body.optionsJson !== undefined || body.settings !== undefined || body.pairs !== undefined) {
				const type = String(body.type ?? (await db.prepare(`SELECT type FROM quiz_questions WHERE id = ?`).bind(second).first<{ type: string }>().then((r) => r?.type).catch(() => 'choice')) ?? 'choice');
				const oj = typeof body.optionsJson === 'string' ? body.optionsJson : optionsToJson(type, body);
				sets.push('options_json = ?');
				args.push(oj.slice(0, 50000));
			}
			if (body.correctAnswer !== undefined || body.correct_answer !== undefined) {
				sets.push('correct_answer = ?');
				args.push(String(body.correctAnswer ?? body.correct_answer ?? '').slice(0, 5000));
			}
			if (body.sectionSlug !== undefined || body.section_slug !== undefined) {
				sets.push('section_slug = ?');
				args.push(String(body.sectionSlug ?? body.section_slug ?? '').trim().slice(0, 80));
			}
			if (body.sort !== undefined) {
				sets.push('sort = ?');
				args.push(Number(body.sort) || 0);
			}
			if (sets.length === 0) return err('Nincs módosítás.', 400);
			await db.prepare(`UPDATE quiz_questions SET ${sets.join(', ')} WHERE id = ?`).bind(...args, second).run();
			return ok({ ok: true });
		}
		if (method === 'DELETE') {
			await db.prepare(`DELETE FROM quiz_questions WHERE id = ?`).bind(second).run();
			return ok({ ok: true });
		}
	}
	return null;
}

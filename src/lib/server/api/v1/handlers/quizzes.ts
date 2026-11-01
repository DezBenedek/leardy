import { requireLevelEditor } from '$lib/server/curriculum/curriculum-editor';
import { publishedLevelSql } from '$lib/server/curriculum/curriculum-publication';
import { levelIdForLesson, levelIdForQuiz } from '../level-lookup';
import { err, intParam, newId, ok, readJson, strParam, type RouteCtx } from '../http';

export async function handleQuizzes(ctx: RouteCtx): Promise<Response | null> {
	const { event, db, a, user, method, url, segments, head, second, third } = ctx;
	/* Kvízek */
	if (head === 'quizzes' && method === 'GET' && !second) {
		const lessonId = strParam(url, 'lessonId') || strParam(url, 'lesson_id');
		const subjectId = strParam(url, 'subjectId');
		const limit = intParam(url, 'limit', 50, 200);
		const offset = intParam(url, 'offset', 0, 10000);
		if (lessonId) {
			const res = await db
				.prepare(`SELECT id, lesson_id AS lessonId, title, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM quizzes WHERE lesson_id = ? ORDER BY sort, title LIMIT ? OFFSET ?`)
				.bind(lessonId, limit, offset)
				.all();
			const quizzes = (res.results ?? []) as { id: string }[];
			let questions: unknown[] = [];
			if (strParam(url, 'include') === 'questions' && quizzes.length > 0) {
				const qq = await db
					.prepare(`SELECT id, quiz_id AS quizId, question_text AS questionText, COALESCE(type, 'choice') AS type, COALESCE(options_json, '[]') AS optionsJson, COALESCE(correct_answer, '') AS correctAnswer, COALESCE(section_slug, '') AS sectionSlug FROM quiz_questions WHERE quiz_id IN (${quizzes.map(() => '?').join(', ')}) ORDER BY sort, id LIMIT 1000`)
					.bind(...quizzes.map((q) => q.id))
					.all();
				questions = qq.results ?? [];
				return ok({ quizzes, questions, limit, offset });
			}
			return ok({ quizzes, limit, offset });
		}
		const conds: string[] = [];
		const args: string[] = [];
		if (subjectId) {
			conds.push('s.id = ?');
			args.push(subjectId);
		}
		const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
		const res = await db
			.prepare(
				`SELECT q.id, q.lesson_id AS lessonId, q.title, COALESCE(q.section_slug, '') AS sectionSlug,
					le.title AS lessonTitle, s.title AS subjectTitle, s.id AS subjectId
				 FROM quizzes q
				 JOIN lessons le ON le.id = q.lesson_id
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
				 JOIN subjects s ON s.id = l.subject_id
				 ${where} ORDER BY s.sort, le.sort, q.sort LIMIT ? OFFSET ?`
			)
			.bind(...args, limit, offset)
			.all();
		return ok({ quizzes: res.results ?? [], limit, offset });
	}
	if (head === 'quizzes' && method === 'POST' && !second) {
		const body = await readJson(event);
		const lessonId = String(body.lessonId ?? body.lesson_id ?? '').trim();
		const title = String(body.title ?? '').trim();
		if (!lessonId) return err('Hiányzik a lessonId.', 400);
		if (!title) return err('Add meg a kvíz címét.', 400);
		const levelId = await levelIdForLesson(db, lessonId);
		if (!levelId) return err('Nincs ilyen lecke.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		const existing = await db.prepare(`SELECT id FROM quizzes WHERE lesson_id = ?`).bind(lessonId).first<{ id: string }>().catch(() => null);
		if (existing) return err('Ehhez a leckéhez már tartozik kvíz.', 409);
		const id = newId('quiz');
		await db
			.prepare(`INSERT INTO quizzes (id, lesson_id, section_slug, title, sort) VALUES (?, ?, ?, ?, ?)`)
			.bind(id, lessonId, '', title.slice(0, 200), Number(body.sort) || 0)
			.run();
		return ok({ ok: true, id }, 201);
	}
	if (head === 'quizzes' && second) {
		if (method === 'GET') {
			const row = await db
				.prepare(`SELECT id, lesson_id AS lessonId, title, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM quizzes WHERE id = ?`)
				.bind(second)
				.first();
			if (!row) return err('Nincs ilyen kvíz.', 404);
			const qq = await db
				.prepare(`SELECT id, quiz_id AS quizId, question_text AS questionText, COALESCE(type, 'choice') AS type, COALESCE(options_json, '[]') AS optionsJson, COALESCE(correct_answer, '') AS correctAnswer, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM quiz_questions WHERE quiz_id = ? ORDER BY sort, id LIMIT 500`)
				.bind(second)
				.all();
			return ok({ quiz: row, questions: qq.results ?? [] });
		}
		const levelId = await levelIdForQuiz(db, second);
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
			if (body.title !== undefined) {
				const t = String(body.title).trim();
				if (!t) return err('A cím nem lehet üres.', 400);
				sets.push('title = ?');
				args.push(t.slice(0, 200));
			}

			if (body.sort !== undefined) {
				sets.push('sort = ?');
				args.push(Number(body.sort) || 0);
			}
			if (body.lessonId !== undefined || body.lesson_id !== undefined) {
				const nl = String(body.lessonId ?? body.lesson_id ?? '').trim();
				const nlvl = nl ? await levelIdForLesson(db, nl) : null;
				if (!nl || !nlvl) return err('Nincs ilyen céllecke.', 404);
				try {
					await requireLevelEditor(db, user, nlvl);
				} catch {
					return err('A célleckéhez nincs jogosultságod.', 403);
				}
				const taken = await db.prepare(`SELECT id FROM quizzes WHERE lesson_id = ? AND id != ?`).bind(nl, second).first<{ id: string }>().catch(() => null);
				if (taken) return err('A célleckéhez már tartozik kvíz.', 409);
				sets.push('lesson_id = ?');
				args.push(nl);
			}
			if (sets.length === 0) return err('Nincs módosítás.', 400);
			await db.prepare(`UPDATE quizzes SET ${sets.join(', ')} WHERE id = ?`).bind(...args, second).run();
			return ok({ ok: true });
		}
		if (method === 'DELETE') {
			await db.batch([
				db.prepare(`DELETE FROM quiz_questions WHERE quiz_id = ?`).bind(second),
				db.prepare(`DELETE FROM quizzes WHERE id = ?`).bind(second)
			]);
			return ok({ ok: true });
		}
	}
	return null;
}

import { ensureCurriculumSchema } from '$lib/server/curriculum/curriculum';
import { requireLevelEditor } from '$lib/server/curriculum/curriculum-editor';
import { publishedLevelSql } from '$lib/server/curriculum/curriculum-publication';
import { levelIdForLesson, levelIdForMaterial } from '../level-lookup';
import { err, intParam, newId, ok, readJson, strParam, type RouteCtx } from '../http';

export async function handleLessons(ctx: RouteCtx): Promise<Response | null> {
	const { event, db, a, user, method, url, segments, head, second, third } = ctx;
	/* Leckék */
	if (head === 'lessons' && method === 'GET' && !second) {
		const materialId = strParam(url, 'materialId');
		const subjectId = strParam(url, 'subjectId') || strParam(url, 'subject');
		const search = strParam(url, 'search') || strParam(url, 'q');
		const limit = intParam(url, 'limit', 50, 200);
		const offset = intParam(url, 'offset', 0, 10000);
		const conds: string[] = [];
		const args: string[] = [];
		if (materialId) {
			conds.push('le.material_id = ?');
			args.push(materialId);
		}
		if (subjectId) {
			conds.push('l.subject_id = ?');
			args.push(subjectId);
		}
		if (search) {
			conds.push('(le.title LIKE ? OR le.body_md LIKE ?)');
			args.push(`%${search}%`, `%${search}%`);
		}
		const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
		const res = await db
			.prepare(
				`SELECT le.id, le.material_id AS materialId, le.title, COALESCE(le.sort, 0) AS sort,
					m.title AS materialTitle, l.title AS levelTitle, s.title AS subjectTitle,
					s.id AS subjectId, l.id AS levelId
				 FROM lessons le
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
				 JOIN subjects s ON s.id = l.subject_id
				 ${where} ORDER BY s.sort, l.sort, m.sort, le.sort, le.title LIMIT ? OFFSET ?`
			)
			.bind(...args, limit, offset)
			.all();
		return ok({ lessons: res.results ?? [], limit, offset });
	}
	if (head === 'lessons' && method === 'POST' && !second) {
		const body = await readJson(event);
		const materialId = String(body.materialId ?? body.material_id ?? '').trim();
		const title = String(body.title ?? '').trim();
		if (!materialId) return err('Hiányzik a materialId.', 400);
		if (!title) return err('Add meg a lecke címét.', 400);
		const levelId = await levelIdForMaterial(db, materialId);
		if (!levelId) return err('Nincs ilyen témakör.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		const bodyMd = String(body.bodyMd ?? body.body_md ?? '');
		const sort = Number.isFinite(Number(body.sort)) ? Number(body.sort) : 0;
		const id = newId('les');
		await ensureCurriculumSchema(db);
		await db
			.prepare(`INSERT INTO lessons (id, material_id, title, body_md, sort) VALUES (?, ?, ?, ?, ?)`)
			.bind(id, materialId, title.slice(0, 200), bodyMd.slice(0, 200000), sort)
			.run();
		return ok({ ok: true, id, lesson: { id, materialId, title, sort } }, 201);
	}
	if (head === 'lessons' && second) {
		if (method === 'GET') {
			const include = strParam(url, 'include');
			const row = await db
				.prepare(
					`SELECT le.id, le.material_id AS materialId, le.title,
						COALESCE(le.body_md, '') AS bodyMd, COALESCE(le.sort, 0) AS sort,
						m.title AS materialTitle, l.title AS levelTitle, s.title AS subjectTitle,
						s.id AS subjectId, l.id AS levelId
					 FROM lessons le
					 JOIN materials m ON m.id = le.material_id
					 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
					 JOIN subjects s ON s.id = l.subject_id
					 WHERE le.id = ?`
				)
				.bind(second)
				.first();
			if (!row) return err('Nincs ilyen lecke.', 404);
			const out: Record<string, unknown> = { lesson: row };
			if (include.includes('quiz') || include === 'all') {
				const qRes = await db
					.prepare(`SELECT id, title, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM quizzes WHERE lesson_id = ? ORDER BY sort, title LIMIT 100`)
					.bind(second)
					.all();
				const quizzes = (qRes.results ?? []) as { id: string }[];
				let questions: unknown[] = [];
				if (quizzes.length > 0) {
					const qq = await db
						.prepare(`SELECT id, quiz_id AS quizId, question_text AS questionText, COALESCE(type, 'choice') AS type, COALESCE(options_json, '[]') AS optionsJson, COALESCE(correct_answer, '') AS correctAnswer, COALESCE(section_slug, '') AS sectionSlug FROM quiz_questions WHERE quiz_id IN (${quizzes.map(() => '?').join(', ')}) ORDER BY sort, id LIMIT 1000`)
						.bind(...quizzes.map((q) => q.id))
						.all();
					questions = qq.results ?? [];
				}
				out.quizzes = quizzes;
				out.questions = questions;
			}
			if (include.includes('card') || include === 'all') {
				const cRes = await db
					.prepare(`SELECT id, COALESCE(pack_id, '') AS packId, COALESCE(section_slug, '') AS sectionSlug, COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(sort, 0) AS sort FROM lesson_cards WHERE lesson_id = ? ORDER BY sort, id LIMIT 1000`)
					.bind(second)
					.all();
				out.lessonCards = cRes.results ?? [];
				const pRes = await db
					.prepare(`SELECT id, title, COALESCE(card_kind, 'word') AS cardKind, COALESCE(sort, 0) AS sort FROM lesson_card_packs WHERE lesson_id = ? ORDER BY sort, title LIMIT 100`)
					.bind(second)
					.all();
				out.cardPacks = pRes.results ?? [];
			}
			return ok(out);
		}
		if (method === 'PATCH') {
			const body = await readJson(event);
			const levelId = await levelIdForLesson(db, second);
			if (!levelId) return err('Nincs ilyen lecke.', 404);
			try {
				await requireLevelEditor(db, user, levelId);
			} catch {
				return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
			}
			const sets: string[] = [];
			const args: (string | number)[] = [];
			if (body.title !== undefined) {
				const t = String(body.title).trim();
				if (!t) return err('A cím nem lehet üres.', 400);
				sets.push('title = ?');
				args.push(t.slice(0, 200));
			}
			const bodyMd = body.bodyMd ?? body.body_md;
			if (bodyMd !== undefined) {
				sets.push('body_md = ?');
				args.push(String(bodyMd).slice(0, 200000));
			}
			if (body.sort !== undefined) {
				sets.push('sort = ?');
				args.push(Number(body.sort) || 0);
			}
			if (body.materialId !== undefined || body.material_id !== undefined) {
				const nm = String(body.materialId ?? body.material_id ?? '').trim();
				const nl = nm ? await levelIdForMaterial(db, nm) : null;
				if (!nm || !nl) return err('Nincs ilyen céltémakör.', 404);
				try {
					await requireLevelEditor(db, user, nl);
				} catch {
					return err('A céltananyaghoz nincs jogosultságod.', 403);
				}
				sets.push('material_id = ?');
				args.push(nm);
			}
			if (sets.length === 0) return err('Nincs módosítás.', 400);
			await db.prepare(`UPDATE lessons SET ${sets.join(', ')} WHERE id = ?`).bind(...args, second).run();
			return ok({ ok: true });
		}
		if (method === 'DELETE') {
			const levelId = await levelIdForLesson(db, second);
			if (!levelId) return err('Nincs ilyen lecke.', 404);
			try {
				await requireLevelEditor(db, user, levelId);
			} catch {
				return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
			}
			await db.batch([
				db.prepare(`DELETE FROM quiz_questions WHERE quiz_id IN (SELECT id FROM quizzes WHERE lesson_id = ?)`).bind(second),
				db.prepare(`DELETE FROM quizzes WHERE lesson_id = ?`).bind(second),
				db.prepare(`DELETE FROM lesson_cards WHERE lesson_id = ?`).bind(second),
				db.prepare(`DELETE FROM lessons WHERE id = ?`).bind(second)
			]);
			return ok({ ok: true });
		}
	}
	return null;
}

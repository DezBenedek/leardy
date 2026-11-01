import { setPackLessons } from '$lib/server/curriculum/curriculum';
import { requireLevelEditor } from '$lib/server/curriculum/curriculum-editor';
import { publishedLevelSql } from '$lib/server/curriculum/curriculum-publication';
import { levelIdForLesson, levelIdForPack } from '../level-lookup';
import { err, intParam, newId, ok, readJson, strParam, type RouteCtx } from '../http';

export async function handleCardPacks(ctx: RouteCtx): Promise<Response | null> {
	const { event, db, a, user, method, url, segments, head, second, third } = ctx;
	/* Hivatalos kártyacsomagok */
	if (head === 'card-packs' && method === 'GET' && !second) {
		const subjectId = strParam(url, 'subjectId') || strParam(url, 'subject');
		const lessonId = strParam(url, 'lessonId');
		const limit = intParam(url, 'limit', 50, 200);
		const offset = intParam(url, 'offset', 0, 10000);
		const conds: string[] = [];
		const args: (string | number)[] = [];
		if (lessonId) {
			conds.push('p.lesson_id = ?');
			args.push(lessonId);
		}
		if (subjectId) {
			conds.push('s.id = ?');
			args.push(subjectId);
		}
		const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
		const res = await db
			.prepare(
				`SELECT p.id, p.title, COALESCE(p.card_kind, 'word') AS cardKind,
					p.lesson_id AS lessonId, le.title AS lessonTitle,
					s.id AS subjectId, s.title AS subjectTitle, l.title AS levelTitle,
					COALESCE(p.sort, 0) AS sort,
					(SELECT COUNT(*) FROM lesson_cards c WHERE c.pack_id = p.id) AS cardCount
				 FROM lesson_card_packs p
				 JOIN lessons le ON le.id = p.lesson_id
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
				 JOIN subjects s ON s.id = l.subject_id
				 ${where} ORDER BY s.sort, p.sort, p.title LIMIT ? OFFSET ?`
			)
			.bind(...args, limit, offset)
			.all();
		return ok({ packs: res.results ?? [], limit, offset });
	}
	if (head === 'card-packs' && method === 'POST' && !second) {
		const body = await readJson(event);
		const lessonId = String(body.lessonId ?? body.lesson_id ?? '').trim();
		const title = String(body.title ?? '').trim();
		if (!lessonId) return err('Hiányzik a lessonId.', 400);
		if (!title) return err('Add meg a csomag címét.', 400);
		const levelId = await levelIdForLesson(db, lessonId);
		if (!levelId) return err('Nincs ilyen lecke.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		const id = newId('pack');
		await db
			.prepare(`INSERT INTO lesson_card_packs (id, lesson_id, title, card_kind, sort) VALUES (?, ?, ?, ?, ?)`)
			.bind(id, lessonId, title.slice(0, 200), body.cardKind === 'study' ? 'study' : 'word', Number(body.sort) || 0)
			.run();
		const extraLessons = Array.isArray(body.lessonIds) ? body.lessonIds.map((s) => String(s).trim()).filter(Boolean).slice(0, 50) : [];
		if (extraLessons.length > 0) {
			try {
				await setPackLessons(db, id, [lessonId, ...extraLessons]);
			} catch {
				// kapcsoló nem kritikus
			}
		}
		return ok({ ok: true, id }, 201);
	}
	if (head === 'card-packs' && second) {
		if (method === 'GET') {
			const row = await db
				.prepare(`SELECT p.id, p.title, COALESCE(p.card_kind, 'word') AS cardKind, p.lesson_id AS lessonId, le.title AS lessonTitle, COALESCE(p.sort, 0) AS sort FROM lesson_card_packs p JOIN lessons le ON le.id = p.lesson_id WHERE p.id = ?`)
				.bind(second)
				.first();
			if (!row) return err('Nincs ilyen csomag.', 404);
			const cards = await db
				.prepare(`SELECT id, COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM lesson_cards WHERE pack_id = ? ORDER BY sort, id LIMIT 1000`)
				.bind(second)
				.all();
			return ok({ pack: row, cards: cards.results ?? [] });
		}
		const info = await levelIdForPack(db, second);
		if (!info) return err('Nincs ilyen csomag.', 404);
		try {
			await requireLevelEditor(db, user, info.levelId);
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
			if (body.cardKind !== undefined) {
				sets.push('card_kind = ?');
				args.push(body.cardKind === 'study' ? 'study' : 'word');
			}
			if (body.sort !== undefined) {
				sets.push('sort = ?');
				args.push(Number(body.sort) || 0);
			}
			if (body.lessonId !== undefined || body.lesson_id !== undefined) {
				const nl = String(body.lessonId ?? body.lesson_id ?? '').trim();
				const nlvl = nl ? await levelIdForLesson(db, nl) : null;
				if (!nl || !nlvl) return err('Nincs ilyen céllecke.', 404);
				sets.push('lesson_id = ?');
				args.push(nl);
			}
			if (sets.length === 0 && body.lessonIds === undefined) return err('Nincs módosítás.', 400);
			if (sets.length > 0) {
				await db.prepare(`UPDATE lesson_card_packs SET ${sets.join(', ')} WHERE id = ?`).bind(...args, second).run();
			}
			if (body.lessonIds !== undefined) {
				const ids = Array.isArray(body.lessonIds) ? body.lessonIds.map((s) => String(s).trim()).filter(Boolean).slice(0, 50) : [];
				try {
					await setPackLessons(db, second, ids);
				} catch {
					// nem kritikus
				}
			}
			return ok({ ok: true });
		}
		if (method === 'DELETE') {
			await db.batch([
				db.prepare(`UPDATE lesson_cards SET pack_id = NULL WHERE pack_id = ?`).bind(second),
				db.prepare(`DELETE FROM lesson_card_packs WHERE id = ?`).bind(second)
			]);
			return ok({ ok: true });
		}
	}
	return null;
}

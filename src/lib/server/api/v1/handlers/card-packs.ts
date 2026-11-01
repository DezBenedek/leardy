import { publishedLevelSql } from '$lib/server/curriculum/curriculum-publication';
import { err, intParam, ok, strParam, type RouteCtx } from '../http';

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
		return err('Hivatalos csomagot már csak a lecke szerkesztőből lehet létrehozni.', 410);
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
		if (method === 'PATCH') {
			return err('Hivatalos csomagot már csak a lecke szerkesztőből lehet szerkeszteni.', 410);
		}
		if (method === 'DELETE') {
			return err('Hivatalos csomagot már csak a lecke szerkesztőből lehet törölni.', 410);
		}
	}
	return null;
}

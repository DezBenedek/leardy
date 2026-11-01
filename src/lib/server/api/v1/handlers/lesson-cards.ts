import { err, intParam, ok, strParam, type RouteCtx } from '../http';

export async function handleLessonCards(ctx: RouteCtx): Promise<Response | null> {
	const { event, db, a, user, method, url, segments, head, second, third } = ctx;
	/* Hivatalos kártyák (leckekártyák) */
	if (head === 'lesson-cards' && method === 'GET' && !second) {
		const lessonId = strParam(url, 'lessonId');
		const packId = strParam(url, 'packId');
		const limit = intParam(url, 'limit', 100, 1000);
		const offset = intParam(url, 'offset', 0, 10000);
		const conds: string[] = [];
		const args: (string | number)[] = [];
		if (lessonId) {
			conds.push('lc.lesson_id = ?');
			args.push(lessonId);
		}
		if (packId) {
			conds.push('lc.pack_id = ?');
			args.push(packId);
		}
		if (conds.length === 0) return err('Add meg a lessonId vagy packId paramétert.', 400);
		const res = await db
			.prepare(`SELECT id, lesson_id AS lessonId, COALESCE(pack_id, '') AS packId, COALESCE(section_slug, '') AS sectionSlug, COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(sort, 0) AS sort FROM lesson_cards lc WHERE ${conds.join(' AND ')} ORDER BY sort, id LIMIT ? OFFSET ?`)
			.bind(...args, limit, offset)
			.all();
		return ok({ cards: res.results ?? [], limit, offset });
	}
	if (head === 'lesson-cards' && method === 'POST' && !second) {
		return err('Hivatalos kártyát már csak a lecke szerkesztőből lehet létrehozni.', 410);
	}
	if (head === 'lesson-cards' && second) {
		const cardRow = await db.prepare(`SELECT id, lesson_id AS lessonId FROM lesson_cards WHERE id = ?`).bind(second).first<{ id: string; lessonId: string }>().catch(() => null);
		if (!cardRow) return err('Nincs ilyen kártya.', 404);
		if (method === 'GET') {
			const row = await db.prepare(`SELECT id, lesson_id AS lessonId, COALESCE(pack_id, '') AS packId, COALESCE(section_slug, '') AS sectionSlug, COALESCE(front, '') AS front, COALESCE(back, '') AS back FROM lesson_cards WHERE id = ?`).bind(second).first();
			return ok({ card: row });
		}
		if (method === 'PATCH') {
			return err('Hivatalos kártyát már csak a lecke szerkesztőből lehet szerkeszteni.', 410);
		}
		if (method === 'DELETE') {
			return err('Hivatalos kártyát már csak a lecke szerkesztőből lehet törölni.', 410);
		}
	}
	return null;
}

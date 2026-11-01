import { requireLevelEditor } from '$lib/server/curriculum/curriculum-editor';
import { levelIdForLesson } from '../level-lookup';
import { err, intParam, newId, ok, readJson, strParam, type RouteCtx } from '../http';

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
		const body = await readJson(event);
		const lessonId = String(body.lessonId ?? body.lesson_id ?? '').trim();
		const front = String(body.front ?? '').trim();
		const back = String(body.back ?? '').trim();
		if (!lessonId) return err('Hiányzik a lessonId.', 400);
		if (!front || !back) return err('Töltsd ki a kártya mindkét oldalát.', 400);
		const levelId = await levelIdForLesson(db, lessonId);
		if (!levelId) return err('Nincs ilyen lecke.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		const packId = String(body.packId ?? body.pack_id ?? '').trim() || null;
		if (packId) {
			const p = await db.prepare(`SELECT id FROM lesson_card_packs WHERE id = ?`).bind(packId).first().catch(() => null);
			if (!p) return err('Nincs ilyen csomag.', 404);
		}
		const id = newId('lc');
		const maxSort = await db.prepare(`SELECT COALESCE(MAX(sort), -1) AS m FROM lesson_cards WHERE lesson_id = ?`).bind(lessonId).first<{ m: number }>().catch(() => ({ m: -1 }));
		await db
			.prepare(`INSERT INTO lesson_cards (id, lesson_id, section_slug, front, back, sort, pack_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
			.bind(id, lessonId, String(body.sectionSlug ?? body.section_slug ?? '').trim().slice(0, 80), front.slice(0, 5000), back.slice(0, 5000), (maxSort?.m ?? -1) + 1, packId)
			.run();
		return ok({ ok: true, id }, 201);
	}
	if (head === 'lesson-cards' && second) {
		const cardRow = await db.prepare(`SELECT id, lesson_id AS lessonId FROM lesson_cards WHERE id = ?`).bind(second).first<{ id: string; lessonId: string }>().catch(() => null);
		if (!cardRow) return err('Nincs ilyen kártya.', 404);
		if (method === 'GET') {
			const row = await db.prepare(`SELECT id, lesson_id AS lessonId, COALESCE(pack_id, '') AS packId, COALESCE(section_slug, '') AS sectionSlug, COALESCE(front, '') AS front, COALESCE(back, '') AS back FROM lesson_cards WHERE id = ?`).bind(second).first();
			return ok({ card: row });
		}
		const levelId = await levelIdForLesson(db, cardRow.lessonId);
		if (!levelId) return err('Nincs ilyen lecke.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		if (method === 'PATCH') {
			const body = await readJson(event);
			const sets: string[] = [];
			const args: (string | number | null)[] = [];
			if (body.front !== undefined) {
				const f = String(body.front).trim();
				if (!f) return err('Az előlap nem lehet üres.', 400);
				sets.push('front = ?');
				args.push(f.slice(0, 5000));
			}
			if (body.back !== undefined) {
				const b = String(body.back).trim();
				if (!b) return err('A hátlap nem lehet üres.', 400);
				sets.push('back = ?');
				args.push(b.slice(0, 5000));
			}
			if (body.sectionSlug !== undefined || body.section_slug !== undefined) {
				sets.push('section_slug = ?');
				args.push(String(body.sectionSlug ?? body.section_slug ?? '').trim().slice(0, 80));
			}
			if (body.packId !== undefined || body.pack_id !== undefined) {
				const p = String(body.packId ?? body.pack_id ?? '').trim() || null;
				sets.push('pack_id = ?');
				args.push(p);
			}
			if (body.sort !== undefined) {
				sets.push('sort = ?');
				args.push(Number(body.sort) || 0);
			}
			if (sets.length === 0) return err('Nincs módosítás.', 400);
			await db.prepare(`UPDATE lesson_cards SET ${sets.join(', ')} WHERE id = ?`).bind(...args, second).run();
			return ok({ ok: true });
		}
		if (method === 'DELETE') {
			await db.prepare(`DELETE FROM lesson_cards WHERE id = ?`).bind(second).run();
			return ok({ ok: true });
		}
	}
	return null;
}

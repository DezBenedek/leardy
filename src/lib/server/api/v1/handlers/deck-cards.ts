import { err, newId, ok, readJson, strParam, type RouteCtx } from '../http';

export async function handleDeckCards(ctx: RouteCtx): Promise<Response | null> {
	const { event, db, a, user, method, url, segments, head, second, third } = ctx;
	/* Saját kártyák */
	if (head === 'deck-cards' && method === 'GET' && !second) {
		const deckId = strParam(url, 'deckId') || strParam(url, 'deck_id');
		if (!deckId) return err('Hiányzik a deckId.', 400);
		const owner = await db.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`).bind(deckId).first<{ userId: string }>().catch(() => null);
		if (!owner || owner.userId !== user.id) return err('Nincs ilyen csomag.', 404);
		const res = await db
			.prepare(`SELECT id, deck_id AS deckId, COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM deck_cards WHERE deck_id = ? ORDER BY sort, id LIMIT 1000`)
			.bind(deckId)
			.all();
		return ok({ cards: res.results ?? [] });
	}
	if (head === 'deck-cards' && method === 'POST' && !second) {
		const body = await readJson(event);
		const deckId = String(body.deckId ?? body.deck_id ?? '').trim();
		const front = String(body.front ?? '').trim();
		const back = String(body.back ?? '').trim();
		if (!deckId) return err('Hiányzik a deckId.', 400);
		if (!front || !back) return err('Töltsd ki a kártya mindkét oldalát.', 400);
		const owner = await db.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`).bind(deckId).first<{ userId: string }>().catch(() => null);
		if (!owner || owner.userId !== user.id) return err('Nincs ilyen csomag.', 404);
		const count = await db.prepare(`SELECT COUNT(*) AS n FROM deck_cards WHERE deck_id = ?`).bind(deckId).first<{ n: number }>().catch(() => ({ n: 0 }));
		if ((count?.n ?? 0) >= 500) return err('Egy csomagban legfeljebb 500 kártya lehet.', 400);
		const maxSort = await db.prepare(`SELECT COALESCE(MAX(sort), -1) AS m FROM deck_cards WHERE deck_id = ?`).bind(deckId).first<{ m: number }>().catch(() => ({ m: -1 }));
		const id = newId('dc');
		await db
			.prepare(`INSERT INTO deck_cards (id, deck_id, front, back, sort, section_slug) VALUES (?, ?, ?, ?, ?, ?)`)
			.bind(id, deckId, front.slice(0, 5000), back.slice(0, 5000), (maxSort?.m ?? -1) + 1, String(body.sectionSlug ?? body.section_slug ?? '').trim().slice(0, 80))
			.run();
		return ok({ ok: true, id }, 201);
	}
	if (head === 'deck-cards' && second) {
		const own = await db
			.prepare(`SELECT deck_cards.id AS id FROM deck_cards JOIN decks ON decks.id = deck_cards.deck_id WHERE deck_cards.id = ? AND decks.user_id = ?`)
			.bind(second, user.id)
			.first()
			.catch(() => null);
		if (!own) return err('Nincs ilyen kártya.', 404);
		if (method === 'GET') {
			const row = await db.prepare(`SELECT id, deck_id AS deckId, COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(section_slug, '') AS sectionSlug FROM deck_cards WHERE id = ?`).bind(second).first();
			return ok({ card: row });
		}
		if (method === 'PATCH') {
			const body = await readJson(event);
			const sets: string[] = [];
			const args: string[] = [];
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
			if (sets.length === 0) return err('Nincs módosítás.', 400);
			await db.prepare(`UPDATE deck_cards SET ${sets.join(', ')} WHERE id = ?`).bind(...args, second).run();
			return ok({ ok: true });
		}
		if (method === 'DELETE') {
			await db.prepare(`DELETE FROM deck_cards WHERE id = ?`).bind(second).run();
			return ok({ ok: true });
		}
	}
	return null;
}

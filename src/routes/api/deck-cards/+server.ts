import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { ensureCurriculumSchema } from '$lib/server/curriculum';

/* Új kártya egy saját csomagba. Body: { deckId, front, back, sectionSlug? }
   Kötegelt felvétel: { deckId, cards: [{ front, back, sectionSlug? }] } */

function newId(prefix: string): string {
	const r = Math.random().toString(36).slice(2, 10);
	return `${prefix}-${Date.now().toString(36)}-${r}`;
}

const MAX_CARDS = 200;

interface CardInput {
	front?: string;
	back?: string;
	sectionSlug?: string;
}

function cleanCardInput(raw: CardInput): { front: string; back: string; sectionSlug: string } | null {
	const front = raw.front?.trim() ?? '';
	const back = raw.back?.trim() ?? '';
	if (!front || !back) return null;
	return { front, back, sectionSlug: raw.sectionSlug?.trim() ?? '' };
}

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let body: { deckId?: string; front?: string; back?: string; sectionSlug?: string; cards?: CardInput[] };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const deckId = body.deckId?.trim() ?? '';
	if (!deckId) return json({ error: 'Hiányzik a csomag.' }, { status: 400 });
	try {
		await ensureCurriculumSchema(db);
		const owner = await db
			.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`)
			.bind(deckId)
			.first<{ userId: string }>();
		if (!owner || owner.userId !== user.id)
			return json({ error: 'Nincs ilyen csomag.' }, { status: 404 });
		// Kötegelt felvétel: a teljes lista egy kérésben érkezik.
		if (Array.isArray(body.cards)) {
			const cleaned = body.cards.map(cleanCardInput);
			if (cleaned.length === 0) return json({ error: 'Nincs felvehető kártya.' }, { status: 400 });
			const bad = cleaned.findIndex((c) => c === null);
			if (bad >= 0)
				return json({ error: `A ${bad + 1}. kártyánál a kifejezés vagy a definíció hiányzik.` }, { status: 400 });
			const count = await db
				.prepare(`SELECT COUNT(*) AS n FROM deck_cards WHERE deck_id = ?`)
				.bind(deckId)
				.first<{ n: number }>();
			const room = MAX_CARDS - (count?.n ?? 0);
			if (room <= 0)
				return json({ error: 'Betelt a csomag: legfeljebb 200 kártya lehet benne.' }, { status: 400 });
			const take = cleaned.slice(0, room) as { front: string; back: string; sectionSlug: string }[];
			const maxSort = await db
				.prepare(`SELECT COALESCE(MAX(sort), -1) AS m FROM deck_cards WHERE deck_id = ?`)
				.bind(deckId)
				.first<{ m: number }>();
			const base = (maxSort?.m ?? -1) + 1;
			const ids = take.map(() => newId('dc'));
			await db.batch(
				take.map((c, i) =>
					db
						.prepare(
							`INSERT INTO deck_cards (id, deck_id, front, back, sort, section_slug) VALUES (?, ?, ?, ?, ?, ?)`
						)
						.bind(ids[i], deckId, c.front, c.back, base + i, c.sectionSlug)
				)
			);
			return json({ ok: true, ids, skipped: cleaned.length - take.length });
		}
		const single = cleanCardInput(body);
		if (!single) return json({ error: 'Töltsd ki a kifejezést és a definíciót!' }, { status: 400 });
		const count = await db
			.prepare(`SELECT COUNT(*) AS n FROM deck_cards WHERE deck_id = ?`)
			.bind(deckId)
			.first<{ n: number }>();
		if ((count?.n ?? 0) >= MAX_CARDS)
			return json({ error: 'Legfeljebb 200 kártya lehet egy csomagban.' }, { status: 400 });
		const maxSort = await db
			.prepare(`SELECT COALESCE(MAX(sort), -1) AS m FROM deck_cards WHERE deck_id = ?`)
			.bind(deckId)
			.first<{ m: number }>();
		const id = newId('dc');
		await db
			.prepare(
				`INSERT INTO deck_cards (id, deck_id, front, back, sort, section_slug) VALUES (?, ?, ?, ?, ?, ?)`
			)
			.bind(id, deckId, single.front, single.back, (maxSort?.m ?? -1) + 1, single.sectionSlug)
			.run();
		return json({ ok: true, id });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült felvenni a kártyát.' },
			{ status: 500 }
		);
	}
};

/* Több kártya módosítása egy kérésben.
   Body: { deckId, cards: [{ id, front, back, sectionSlug? }] } */
export const PUT: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let body: { deckId?: string; cards?: (CardInput & { id?: string })[] };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const deckId = body.deckId?.trim() ?? '';
	const list = Array.isArray(body.cards) ? body.cards : [];
	if (!deckId) return json({ error: 'Hiányzik a csomag.' }, { status: 400 });
	if (list.length === 0) return json({ error: 'Nincs módosítandó kártya.' }, { status: 400 });
	if (list.length > MAX_CARDS) return json({ error: 'Túl sok kártya egy kérésben.' }, { status: 400 });
	try {
		await ensureCurriculumSchema(db);
		const owner = await db
			.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`)
			.bind(deckId)
			.first<{ userId: string }>();
		if (!owner || owner.userId !== user.id)
			return json({ error: 'Nincs ilyen csomag.' }, { status: 404 });
		const cleaned: { id: string; front: string; back: string; sectionSlug: string }[] = [];
		for (let i = 0; i < list.length; i++) {
			const id = list[i].id?.trim() ?? '';
			if (!id) return json({ error: `A ${i + 1}. kártya azonosítója hiányzik.` }, { status: 400 });
			const c = cleanCardInput(list[i]);
			if (!c) return json({ error: `A ${i + 1}. kártyánál a kifejezés vagy a definíció hiányzik.` }, { status: 400 });
			cleaned.push({ id, ...c });
		}
		const rows = await db
			.prepare(`SELECT id FROM deck_cards WHERE deck_id = ?`)
			.bind(deckId)
			.all<{ id: string }>();
		const own = new Set((rows.results ?? []).map((r) => r.id));
		const foreign = cleaned.find((c) => !own.has(c.id));
		if (foreign) return json({ error: 'Nincs ilyen kártya.' }, { status: 404 });
		await db.batch(
			cleaned.map((c) =>
				db
					.prepare(`UPDATE deck_cards SET front = ?, back = ?, section_slug = ? WHERE id = ?`)
					.bind(c.front, c.back, c.sectionSlug, c.id)
			)
		);
		return json({ ok: true, updated: cleaned.length });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült menteni a kártyákat.' },
			{ status: 500 }
		);
	}
};

/* Több kártya törlése egy kérésben. Body: { deckId, ids: string[] } */
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let body: { deckId?: string; ids?: string[] };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const deckId = body.deckId?.trim() ?? '';
	const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map((x) => String(x).trim()).filter(Boolean))] : [];
	if (!deckId) return json({ error: 'Hiányzik a csomag.' }, { status: 400 });
	if (ids.length === 0) return json({ error: 'Nincs törlendő kártya.' }, { status: 400 });
	if (ids.length > MAX_CARDS) return json({ error: 'Túl sok kártya egy kérésben.' }, { status: 400 });
	try {
		await ensureCurriculumSchema(db);
		const owner = await db
			.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`)
			.bind(deckId)
			.first<{ userId: string }>();
		if (!owner || owner.userId !== user.id)
			return json({ error: 'Nincs ilyen csomag.' }, { status: 404 });
		const placeholders = ids.map(() => '?').join(',');
		const res = await db
			.prepare(`DELETE FROM deck_cards WHERE deck_id = ? AND id IN (${placeholders})`)
			.bind(deckId, ...ids)
			.run();
		return json({ ok: true, deleted: res.meta.changes ?? 0 });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült törölni a kártyákat.' },
			{ status: 500 }
		);
	}
};

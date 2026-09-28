import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { ensureCurriculumSchema } from '$lib/server/curriculum';

/* Saját kártya módosítása és törlése ownership join-nal. */

export const PATCH: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const cardId = event.params.id ?? '';
	let body: { front?: string; back?: string; sectionSlug?: string };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	try {
		await ensureCurriculumSchema(db);
		const row = await db
			.prepare(
				`SELECT deck_cards.id AS id
				 FROM deck_cards JOIN decks ON decks.id = deck_cards.deck_id
				 WHERE deck_cards.id = ? AND decks.user_id = ?`
			)
			.bind(cardId, user.id)
			.first<{ id: string }>();
		if (!row) return json({ error: 'Nincs ilyen kártya.' }, { status: 404 });
		const sets: string[] = [];
		const args: string[] = [];
		if (body.front !== undefined) {
			const front = body.front.trim();
			if (!front) return json({ error: 'Töltsd ki a kártya előlapját!' }, { status: 400 });
			sets.push('front = ?');
			args.push(front);
		}
		if (body.back !== undefined) {
			const back = body.back.trim();
			if (!back) return json({ error: 'Töltsd ki a kártya hátlapját!' }, { status: 400 });
			sets.push('back = ?');
			args.push(back);
		}
		if (body.sectionSlug !== undefined) {
			sets.push('section_slug = ?');
			args.push(body.sectionSlug.trim());
		}
		if (sets.length === 0) return json({ error: 'Nincs módosítás.' }, { status: 400 });
		await db
			.prepare(`UPDATE deck_cards SET ${sets.join(', ')} WHERE id = ?`)
			.bind(...args, cardId)
			.run();
		return json({ ok: true });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült menteni a kártyát.' },
			{ status: 500 }
		);
	}
};

export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const cardId = event.params.id ?? '';
	try {
		await ensureCurriculumSchema(db);
		const res = await db
			.prepare(
				`DELETE FROM deck_cards
				 WHERE id = ? AND deck_id IN (SELECT id FROM decks WHERE user_id = ?)`
			)
			.bind(cardId, user.id)
			.run();
		if ((res.meta.changes ?? 0) === 0)
			return json({ error: 'Nincs ilyen kártya.' }, { status: 404 });
		return json({ ok: true });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült törölni a kártyát.' },
			{ status: 500 }
		);
	}
};

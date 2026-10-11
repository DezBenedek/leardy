import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { ensureCurriculumSchema } from '$lib/server/curriculum';

/* Új kártya egy saját csomagba. Body: { deckId, front, back, sectionSlug? } */

function newId(prefix: string): string {
	const r = Math.random().toString(36).slice(2, 10);
	return `${prefix}-${Date.now().toString(36)}-${r}`;
}

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let body: { deckId?: string; front?: string; back?: string; sectionSlug?: string };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const deckId = body.deckId?.trim() ?? '';
	const front = body.front?.trim() ?? '';
	const back = body.back?.trim() ?? '';
	if (!deckId) return json({ error: 'Hiányzik a csomag.' }, { status: 400 });
	if (!front || !back) return json({ error: 'Töltsd ki a kártya mindkét oldalát!' }, { status: 400 });
	try {
		await ensureCurriculumSchema(db);
		const owner = await db
			.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`)
			.bind(deckId)
			.first<{ userId: string }>();
		if (!owner || owner.userId !== user.id)
			return json({ error: 'Nincs ilyen csomag.' }, { status: 404 });
		const count = await db
			.prepare(`SELECT COUNT(*) AS n FROM deck_cards WHERE deck_id = ?`)
			.bind(deckId)
			.first<{ n: number }>();
		if ((count?.n ?? 0) >= 200)
			return json({ error: 'Legfeljebb 200 kártya lehet egy csomagban.' }, { status: 400 });
		const maxSort = await db
			.prepare(`SELECT COALESCE(MAX(sort), -1) AS m FROM deck_cards WHERE deck_id = ?`)
			.bind(deckId)
			.first<{ m: number }>();
		const id = newId('dc');
		const sectionSlug = body.sectionSlug?.trim() ?? '';
		await db
			.prepare(
				`INSERT INTO deck_cards (id, deck_id, front, back, sort, section_slug) VALUES (?, ?, ?, ?, ?, ?)`
			)
			.bind(id, deckId, front, back, (maxSort?.m ?? -1) + 1, sectionSlug)
			.run();
		return json({ ok: true, id });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült felvenni a kártyát.' },
			{ status: 500 }
		);
	}
};

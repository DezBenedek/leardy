import { json, type RequestHandler } from '@sveltejs/kit';
import type { D1PreparedStatement } from '@cloudflare/workers-types';
import { getDb, requireUser } from '$lib/server/db';
import { ensureCurriculumSchema } from '$lib/server/curriculum';

/* Saját kártyacsomag létrehozása: csak bejelentkezve, csak magának.
   A Kártyák területen már csak kártyacsomag van, kvízcsomag nem hozható létre.
   Body: { title, subjectId?, levelId?, materialId?, lessonId?, cards?: [{front, back}] } */

interface DeckCardInput {
	front?: string;
	back?: string;
}

function newId(prefix: string): string {
	const r = Math.random().toString(36).slice(2, 10);
	return `${prefix}-${Date.now().toString(36)}-${r}`;
}

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let body: {
		title?: string;
		kind?: string;
		cardKind?: string;
		subjectId?: string;
		levelId?: string;
		materialId?: string;
		lessonId?: string;
		cards?: DeckCardInput[];
	};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const title = body.title?.trim() ?? '';
	const kind = 'cards';
	const cardKind = body.cardKind === 'study' ? 'study' : 'word';
	const cards = (body.cards ?? [])
		.map((c) => ({ front: c.front?.trim() ?? '', back: c.back?.trim() ?? '' }))
		.filter((c) => c.front && c.back);
	if (!title) return json({ error: 'Add meg a csomag címét!' }, { status: 400 });
	if (cards.length > 200) return json({ error: 'Legfeljebb 200 kártya lehet egy csomagban.' }, { status: 400 });
	try {
		await ensureCurriculumSchema(db);
		const deckId = newId('deck');
		const now = Math.floor(Date.now() / 1000);
		const batch: D1PreparedStatement[] = [
			db
				.prepare(
					`INSERT INTO decks (id, user_id, title, kind, card_kind, subject_id, level_id, material_id, lesson_id, created_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					deckId,
					user.id,
					title,
					kind,
					cardKind,
					body.subjectId || null,
					body.levelId || null,
					body.materialId || null,
					body.lessonId || null,
					now
				)
		];
		cards.forEach((c, i) => {
			batch.push(
				db
					.prepare(
						`INSERT INTO deck_cards (id, deck_id, front, back, sort) VALUES (?, ?, ?, ?, ?)`
					)
					.bind(newId('dc'), deckId, c.front, c.back, i)
			);
		});
		await db.batch(batch);
		return json({ ok: true, id: deckId });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült létrehozni a csomagot.' },
			{ status: 500 }
		);
	}
};

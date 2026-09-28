import { json, type RequestHandler } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import { getDb, requireUser, type PublicUser } from '$lib/server/db';
import { ensureCurriculumSchema } from '$lib/server/curriculum';

/* Saját csomag lekérése, módosítása, törlése.
   Mindhárom requireUser + ownership-ellenőrzéssel (idegen id → 404). */

/** A csomag ownerének user_id-je, vagy null ha nincs ilyen csomag. */
async function ownerOf(db: D1Database, deckId: string): Promise<string | null> {
	const row = await db
		.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`)
		.bind(deckId)
		.first<{ userId: string }>();
	return row?.userId ?? null;
}

async function guard(
	event: Parameters<RequestHandler>[0],
	db: D1Database
): Promise<{ user: PublicUser; deckId: string } | ReturnType<typeof json>> {
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const deckId = event.params.id ?? '';
	const owner = await ownerOf(db, deckId);
	if (!owner || owner !== user.id) return json({ error: 'Nincs ilyen csomag.' }, { status: 404 });
	return { user, deckId };
}

export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	try {
		await ensureCurriculumSchema(db);
		const g = await guard(event, db);
		if (g instanceof Response) return g;
		const deck = await db
			.prepare(
				`SELECT id, title, COALESCE(kind, 'cards') AS kind, subject_id AS subjectId, level_id AS levelId,
					material_id AS materialId, lesson_id AS lessonId
				 FROM decks WHERE id = ?`
			)
			.bind(g.deckId)
			.first<{
				id: string;
				title: string;
				kind: string;
				subjectId: string | null;
				levelId: string | null;
				materialId: string | null;
				lessonId: string | null;
			}>();
		if (!deck) return json({ error: 'Nincs ilyen csomag.' }, { status: 404 });
		const cardsRes = await db
			.prepare(
				`SELECT id, COALESCE(front, '') AS front, COALESCE(back, '') AS back,
					COALESCE(section_slug, '') AS sectionSlug
				 FROM deck_cards WHERE deck_id = ? ORDER BY sort, id`
			)
			.bind(g.deckId)
			.all<{ id: string; front: string; back: string; sectionSlug: string }>();
		return json({
			deck: {
				id: deck.id,
				title: deck.title,
				kind: deck.kind === 'quiz' ? 'quiz' : 'cards',
				subjectId: deck.subjectId,
				levelId: deck.levelId,
				materialId: deck.materialId,
				lessonId: deck.lessonId,
				cards: cardsRes.results ?? []
			}
		});
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült betölteni a csomagot.' },
			{ status: 500 }
		);
	}
};

export const PATCH: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	let body: {
		title?: string;
		kind?: string;
		subjectId?: string | null;
		levelId?: string | null;
		materialId?: string | null;
		lessonId?: string | null;
	};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	try {
		await ensureCurriculumSchema(db);
		const g = await guard(event, db);
		if (g instanceof Response) return g;
		const sets: string[] = [];
		const args: (string | null)[] = [];
		if (body.title !== undefined) {
			const title = body.title.trim();
			if (!title) return json({ error: 'Add meg a csomag címét!' }, { status: 400 });
			sets.push('title = ?');
			args.push(title);
		}
		if (body.kind !== undefined) {
			if (body.kind !== 'cards')
				return json({ error: 'Már csak kártyacsomag van, kvízcsomag nem.' }, { status: 400 });
		}
		if (body.subjectId !== undefined) {
			sets.push('subject_id = ?');
			args.push(body.subjectId || null);
		}
		if (body.levelId !== undefined) {
			sets.push('level_id = ?');
			args.push(body.levelId || null);
		}
		if (body.materialId !== undefined) {
			sets.push('material_id = ?');
			args.push(body.materialId || null);
		}
		if (body.lessonId !== undefined) {
			const lesson = body.lessonId || null;
			sets.push('lesson_id = ?');
			args.push(lesson);
		}
		if (sets.length === 0) return json({ error: 'Nincs módosítás.' }, { status: 400 });
		await db
			.prepare(`UPDATE decks SET ${sets.join(', ')} WHERE id = ?`)
			.bind(...args, g.deckId)
			.run();
		return json({ ok: true });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült menteni a csomagot.' },
			{ status: 500 }
		);
	}
};

export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	try {
		await ensureCurriculumSchema(db);
		const g = await guard(event, db);
		if (g instanceof Response) return g;
		// CASCADE mellett is explicit töröljük a kártyákat (D1 FK-kikapcsolás ellen).
		await db.batch([
			db.prepare(`DELETE FROM deck_cards WHERE deck_id = ?`).bind(g.deckId),
			db.prepare(`DELETE FROM decks WHERE id = ?`).bind(g.deckId)
		]);
		return json({ ok: true });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült törölni a csomagot.' },
			{ status: 500 }
		);
	}
};

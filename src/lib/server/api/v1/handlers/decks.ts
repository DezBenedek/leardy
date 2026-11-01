import { ensureCurriculumSchema, setDeckLessons } from '$lib/server/curriculum/curriculum';
import { cardKindForSubject } from '$lib/deck/sm2';
import { err, intParam, newId, ok, readJson, strParam, type RouteCtx } from '../http';

export async function handleDecks(ctx: RouteCtx): Promise<Response | null> {
	const { event, db, a, user, method, url, segments, head, second, third } = ctx;
	/* Saját csomagok */
	if (head === 'decks' && method === 'GET' && !second) {
		const subjectId = strParam(url, 'subjectId');
		const limit = intParam(url, 'limit', 100, 500);
		const conds = ['d.user_id = ?'];
		const args: (string | number)[] = [user.id];
		if (subjectId) {
			conds.push('d.subject_id = ?');
			args.push(subjectId);
		}
		const res = await db
			.prepare(
				`SELECT d.id, d.title, COALESCE(d.kind, 'cards') AS kind,
					COALESCE(d.card_kind, 'word') AS cardKind,
					d.subject_id AS subjectId, d.level_id AS levelId,
					d.material_id AS materialId, d.lesson_id AS lessonId,
					COALESCE(d.created_at, 0) AS createdAt,
					(SELECT COUNT(*) FROM deck_cards c WHERE c.deck_id = d.id) AS cardCount
				 FROM decks d WHERE ${conds.join(' AND ')} ORDER BY d.created_at DESC LIMIT ?`
			)
			.bind(...args, limit)
			.all();
		return ok({ decks: res.results ?? [] });
	}
	if (head === 'decks' && method === 'POST' && !second) {
		const body = await readJson(event);
		const title = String(body.title ?? '').trim();
		if (!title) return err('Add meg a csomag címét.', 400);
		const cards = Array.isArray(body.cards) ? body.cards.slice(0, 200) : [];
		const cleanCards = cards
			.map((c) => {
				const o = c as Record<string, unknown>;
				return { front: String(o.front ?? '').trim(), back: String(o.back ?? '').trim() };
			})
			.filter((c) => c.front && c.back);
		let cardKind: 'word' | 'study' = 'word';
		const subjectId = String(body.subjectId ?? body.subject_id ?? '').trim() || null;
		if (subjectId) {
			const subj = await db.prepare(`SELECT title, COALESCE(icon, 'book') AS icon FROM subjects WHERE id = ?`).bind(subjectId).first<{ title: string; icon: string }>().catch(() => null);
			cardKind = cardKindForSubject(subj?.title ?? '', subj?.icon ?? 'book', subjectId);
		}
		const id = newId('deck');
		const now = Math.floor(Date.now() / 1000);
		const lessonIds = Array.isArray(body.lessonIds)
			? [...new Set(body.lessonIds.map((s) => String(s).trim()).filter(Boolean))].slice(0, 50)
			: body.lessonId || body.lesson_id
				? [String(body.lessonId ?? body.lesson_id)]
				: [];
		const isPublic = body.isPublic === true || body.is_public === 1 || body.is_public === true ? 1 : 0;
		await ensureCurriculumSchema(db);
		const batch: { run: () => Promise<unknown> }[] = [];
		batch.push(
			db.prepare(`INSERT INTO decks (id, user_id, title, kind, card_kind, subject_id, level_id, material_id, lesson_id, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
				.bind(id, user.id, title.slice(0, 200), 'cards', cardKind, subjectId, String(body.levelId ?? body.level_id ?? '').trim() || null, String(body.materialId ?? body.material_id ?? '').trim() || null, lessonIds[0] ?? null, isPublic, now) as unknown as { run: () => Promise<unknown> }
		);
		for (let i = 0; i < cleanCards.length; i++) {
			batch.push(
				db.prepare(`INSERT INTO deck_cards (id, deck_id, front, back, sort) VALUES (?, ?, ?, ?, ?)`)
					.bind(newId('dc'), id, cleanCards[i].front.slice(0, 5000), cleanCards[i].back.slice(0, 5000), i) as unknown as { run: () => Promise<unknown> }
			);
		}
		await db.batch(batch as never[]);
		if (lessonIds.length > 0) {
			try {
				await setDeckLessons(db, id, lessonIds);
			} catch {
				// nem kritikus
			}
		}
		return ok({ ok: true, id, cardKind }, 201);
	}
	if (head === 'decks' && second && third === 'cards' && method === 'GET') {
		const owner = await db.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`).bind(second).first<{ userId: string }>().catch(() => null);
		if (!owner || owner.userId !== user.id) return err('Nincs ilyen csomag.', 404);
		const res = await db
			.prepare(`SELECT id, COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM deck_cards WHERE deck_id = ? ORDER BY sort, id LIMIT 1000`)
			.bind(second)
			.all();
		return ok({ cards: res.results ?? [] });
	}
	if (head === 'decks' && second && !third) {
		const owner = await db.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`).bind(second).first<{ userId: string }>().catch(() => null);
		if (!owner || owner.userId !== user.id) return err('Nincs ilyen csomag.', 404);
		if (method === 'GET') {
			const deck = await db
				.prepare(`SELECT id, title, COALESCE(kind, 'cards') AS kind, COALESCE(card_kind, 'word') AS cardKind, subject_id AS subjectId, level_id AS levelId, material_id AS materialId, lesson_id AS lessonId, COALESCE(is_public, 0) AS isPublic FROM decks WHERE id = ?`)
				.bind(second)
				.first();
			const cards = await db
				.prepare(`SELECT id, COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(section_slug, '') AS sectionSlug FROM deck_cards WHERE deck_id = ? ORDER BY sort, id LIMIT 1000`)
				.bind(second)
				.all();
			return ok({ deck, cards: cards.results ?? [] });
		}
		if (method === 'PATCH') {
			const body = await readJson(event);
			const sets: string[] = [];
			const args: (string | null)[] = [];
			if (body.title !== undefined) {
				const t = String(body.title).trim();
				if (!t) return err('Add meg a csomag címét.', 400);
				sets.push('title = ?');
				args.push(t.slice(0, 200));
			}
			if (body.subjectId !== undefined || body.subject_id !== undefined) {
				sets.push('subject_id = ?');
				args.push(String(body.subjectId ?? body.subject_id ?? '').trim() || null);
			}
			if (body.levelId !== undefined || body.level_id !== undefined) {
				sets.push('level_id = ?');
				args.push(String(body.levelId ?? body.level_id ?? '').trim() || null);
			}
			if (body.materialId !== undefined || body.material_id !== undefined) {
				sets.push('material_id = ?');
				args.push(String(body.materialId ?? body.material_id ?? '').trim() || null);
			}
			let nextLessonIds: string[] | null = null;
			if (body.lessonIds !== undefined) {
				nextLessonIds = Array.isArray(body.lessonIds) ? [...new Set(body.lessonIds.map((s: unknown) => String(s).trim()).filter(Boolean))].slice(0, 50) : [];
				sets.push('lesson_id = ?');
				args.push(nextLessonIds[0] ?? null);
			} else if (body.lessonId !== undefined || body.lesson_id !== undefined) {
				const l = String(body.lessonId ?? body.lesson_id ?? '').trim() || null;
				sets.push('lesson_id = ?');
				args.push(l);
				nextLessonIds = l ? [l] : [];
			}
			if (body.isPublic !== undefined || body.is_public !== undefined) {
				const v = body.isPublic ?? body.is_public;
				sets.push('is_public = ?');
				args.push(v === true || v === 1 ? '1' : '0');
			}
			if (sets.length === 0 && nextLessonIds === null) return err('Nincs módosítás.', 400);
			if (sets.length > 0) {
				await db.prepare(`UPDATE decks SET ${sets.join(', ')} WHERE id = ?`).bind(...args, second).run();
			}
			if (nextLessonIds !== null) {
				try {
					await setDeckLessons(db, second, nextLessonIds);
				} catch {
					// nem kritikus
				}
			}
			return ok({ ok: true });
		}
		if (method === 'DELETE') {
			await db.batch([
				db.prepare(`DELETE FROM deck_cards WHERE deck_id = ?`).bind(second),
				db.prepare(`DELETE FROM decks WHERE id = ? AND user_id = ?`).bind(second, user.id)
			]);
			try {
				await db.prepare(`DELETE FROM deck_lessons WHERE deck_id = ?`).bind(second).run();
			} catch {
				// kapcsoló még nincs
			}
			return ok({ ok: true });
		}
	}
	return null;
}

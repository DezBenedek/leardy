import { publishedLevelSql } from '$lib/server/curriculum/curriculum-publication';
import { err, intParam, ok, readJson, strParam, type RouteCtx } from '../http';

export async function handleLibrarySearch(ctx: RouteCtx): Promise<Response | null> {
	const { event, db, a, user, method, url, segments, head, second, third } = ctx;
	/* Könyvtár */
	if (head === 'library' && method === 'GET' && !second) {
		const savedRes = await db.prepare(`SELECT quiz_id AS id, added_at AS addedAt FROM library WHERE user_id = ? LIMIT 500`).bind(user.id).all().catch(() => ({ results: [] }));
		const mine = await db.prepare(`SELECT id, title FROM decks WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`).bind(user.id).all().catch(() => ({ results: [] }));
		return ok({ saved: (savedRes as { results: unknown[] }).results ?? [], decks: (mine as { results: unknown[] }).results ?? [] });
	}
	if (head === 'library' && method === 'POST' && !second) {
		const body = await readJson(event);
		const quizId = String(body.quizId ?? body.quiz_id ?? body.id ?? '').trim();
		if (!quizId) return err('Hiányzik a csomag azonosítója.', 400);
		if (quizId.startsWith('deck:')) {
			const deckId = quizId.slice(5);
			const owner = await db.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`).bind(deckId).first<{ userId: string }>().catch(() => null);
			if (owner && owner.userId === user.id) return ok({ ok: true, owned: true });
			let pub: { id: string } | null = null;
			try {
				pub = await db.prepare(
					`SELECT id FROM decks WHERE id = ? AND COALESCE(is_public, 0) = 1 AND (COALESCE(is_lesson, 0) = 0 OR NOT EXISTS (
						SELECT 1 FROM level_settings visibility WHERE visibility.level_id = decks.level_id AND visibility.published = 0
					))`
				).bind(deckId).first<{ id: string }>().catch(() => null);
			} catch {
				pub = await db.prepare(`SELECT id FROM decks WHERE id = ? AND COALESCE(is_public, 0) = 1`).bind(deckId).first<{ id: string }>().catch(() => null);
			}
			if (!pub) return err('Nincs ilyen csomag.', 404);
			await db.prepare(`INSERT OR IGNORE INTO library (user_id, quiz_id, added_at) VALUES (?, ?, ?)`).bind(user.id, quizId, Math.floor(Date.now() / 1000)).run();
			return ok({ ok: true });
		}
		if (quizId.startsWith('pack:') || quizId.startsWith('cards:')) {
			await db.prepare(`INSERT OR IGNORE INTO library (user_id, quiz_id, added_at) VALUES (?, ?, ?)`).bind(user.id, quizId, Math.floor(Date.now() / 1000)).run();
			return ok({ ok: true });
		}
		return err('Csak pack:..., cards:... vagy publikált deck:... azonosító menthető.', 400);
	}
	if (head === 'library' && method === 'DELETE' && !second) {
		const body = await readJson(event);
		const quizId = String(body.quizId ?? body.quiz_id ?? url.searchParams.get('id') ?? '').trim();
		if (!quizId) return err('Hiányzik a csomag azonosítója.', 400);
		await db.prepare(`DELETE FROM library WHERE user_id = ? AND quiz_id = ?`).bind(user.id, quizId).run();
		return ok({ ok: true });
	}

	/* Keresés */
	if (head === 'search' && method === 'GET') {
		const q = strParam(url, 'q') || strParam(url, 'query');
		if (q.length < 2) return err('A kereséshez legalább 2 karakter kell.', 400);
		const subjectId = strParam(url, 'subjectId');
		const limit = intParam(url, 'limit', 20, 50);
		const like = `%${q}%`;
		const subjCond = subjectId ? 'AND s.id = ?' : '';
		const subjArgs = subjectId ? [subjectId] : [];
		const lessons = await db
			.prepare(
				`SELECT le.id, le.title, s.title AS subjectTitle FROM lessons le
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
				 JOIN subjects s ON s.id = l.subject_id
				 WHERE (le.title LIKE ? OR le.body_md LIKE ?) ${subjCond}
				 ORDER BY le.title LIMIT ?`
			)
			.bind(like, like, ...subjArgs, limit)
			.all()
			.catch(() => ({ results: [] }));
		const decks = await db
			.prepare(`SELECT id, title FROM decks WHERE user_id = ? AND title LIKE ? ORDER BY created_at DESC LIMIT ?`)
			.bind(user.id, like, limit)
			.all()
			.catch(() => ({ results: [] }));
		return ok({ lessons: (lessons as { results: unknown[] }).results ?? [], decks: (decks as { results: unknown[] }).results ?? [] });
	}
	return null;
}

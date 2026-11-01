import { err, intParam, ok, readJson, strParam, type RouteCtx } from '../http';

export async function handleProgress(ctx: RouteCtx): Promise<Response | null> {
	const { event, db, a, user, method, url, segments, head, second, third } = ctx;
	/* Haladás: leckék */
	if (head === 'progress' && second === 'lessons' && method === 'GET' && !third) {
		const lessonId = strParam(url, 'lessonId');
		if (lessonId) {
			const row = await db.prepare(`SELECT user_id AS userId, lesson_id AS lessonId, done, score, total, updated_at AS updatedAt FROM lesson_progress WHERE user_id = ? AND lesson_id = ?`).bind(user.id, lessonId).first().catch(() => null);
			return ok({ progress: row ?? { userId: user.id, lessonId, done: 0, score: null, total: null } });
		}
		const limit = intParam(url, 'limit', 200, 1000);
		const res = await db.prepare(`SELECT lesson_id AS lessonId, done, score, total, updated_at AS updatedAt FROM lesson_progress WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`).bind(user.id, limit).all().catch(() => ({ results: [] }));
		return ok({ progress: (res as { results: unknown[] }).results ?? [] });
	}
	if (head === 'progress' && second === 'lessons' && method === 'POST' && !third) {
		const body = await readJson(event);
		const lessonId = String(body.lessonId ?? body.lesson_id ?? '').trim();
		if (!lessonId) return err('Hiányzik a lessonId.', 400);
		const done = body.done === true || body.done === 1 || body.done === '1';
		const score = typeof body.score === 'number' ? body.score : null;
		const total = typeof body.total === 'number' ? body.total : null;
		const now = Date.now();
		const day = new Date(now).toISOString().slice(0, 10);
		try {
			await db.batch([
				db.prepare(`INSERT OR REPLACE INTO lesson_progress (user_id, lesson_id, done, score, total, updated_at, event_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(user.id, lessonId, done ? 1 : 0, score, total, Math.floor(now / 1000), now),
				db.prepare(`INSERT OR IGNORE INTO learning_days (user_id, day) VALUES (?, ?)`).bind(user.id, day)
			]);
		} catch {
			await db.batch([
				db.prepare(`INSERT OR REPLACE INTO lesson_progress (user_id, lesson_id, done, score, total, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(user.id, lessonId, done ? 1 : 0, score, total, Math.floor(now / 1000)),
				db.prepare(`INSERT OR IGNORE INTO learning_days (user_id, day) VALUES (?, ?)`).bind(user.id, day)
			]);
		}
		return ok({ ok: true });
	}

	/* Haladás: kártyák */
	if (head === 'progress' && second === 'cards' && !third && method === 'GET') {
		const res = await db
			.prepare(`SELECT card_key AS key, known, seen, COALESCE(repetitions, 0) AS repetitions, COALESCE(ease, 2.5) AS ease, COALESCE(interval_days, 0) AS intervalDays, COALESCE(due_day, 0) AS dueDay FROM card_progress WHERE user_id = ? LIMIT 5000`)
			.bind(user.id)
			.all()
			.catch(() => ({ results: [] }));
		return ok({ progress: (res as { results: unknown[] }).results ?? [] });
	}
	if (head === 'progress' && second === 'cards' && third === 'due' && method === 'GET') {
		// Esedékes kártyák: deckId / pack / lesson szűréssel, SM-2 dueDay alapján.
		const deckId = strParam(url, 'deck') || strParam(url, 'deckId');
		const pack = strParam(url, 'pack');
		const lesson = strParam(url, 'lesson') || strParam(url, 'lessonId');
		const today = Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) / 86400000);
		let cardIds: string[] = [];
		if (deckId) {
			const owner = await db.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`).bind(deckId).first<{ userId: string }>().catch(() => null);
			if (!owner || owner.userId !== user.id) return err('Nincs ilyen csomag.', 404);
			const r = await db.prepare(`SELECT id FROM deck_cards WHERE deck_id = ? LIMIT 2000`).bind(deckId).all<{ id: string }>();
			cardIds = (r.results ?? []).map((c) => c.id);
		} else if (pack) {
			const pid = pack.startsWith('pack:') ? pack.slice(5) : pack;
			const r = await db.prepare(`SELECT id FROM lesson_cards WHERE pack_id = ? LIMIT 2000`).bind(pid).all<{ id: string }>();
			cardIds = (r.results ?? []).map((c) => c.id);
		} else if (lesson) {
			const r = await db.prepare(`SELECT id FROM lesson_cards WHERE lesson_id = ? LIMIT 2000`).bind(lesson).all<{ id: string }>();
			cardIds = (r.results ?? []).map((c) => c.id);
		} else {
			return err('Add meg a deck, pack vagy lesson paramétert.', 400);
		}
		if (cardIds.length === 0) return ok({ due: [], fresh: [], future: [], today, total: 0 });
		const prog = new Map<string, { seen: number; repetitions: number; dueDay: number }>();
		for (let o = 0; o < cardIds.length; o += 80) {
			const chunk = cardIds.slice(o, o + 80);
			const r = await db.prepare(`SELECT card_key AS key, seen, COALESCE(repetitions, 0) AS repetitions, COALESCE(due_day, 0) AS dueDay FROM card_progress WHERE user_id = ? AND card_key IN (${chunk.map(() => '?').join(', ')})`).bind(user.id, ...chunk).all<{ key: string; seen: number; repetitions: number; dueDay: number }>().catch(() => ({ results: [] }));
			for (const row of (r.results ?? [])) prog.set(row.key, row);
		}
		const due: string[] = [];
		const fresh: string[] = [];
		const future: string[] = [];
		for (const id of cardIds) {
			const m = prog.get(id);
			if (!m || (m.seen === 0 && m.repetitions === 0)) {
				due.push(id);
				fresh.push(id);
			} else if (m.dueDay <= today) {
				due.push(id);
			} else {
				future.push(id);
			}
		}
		return ok({ due, fresh, future, today, total: cardIds.length });
	}
	if (head === 'progress' && second === 'cards' && third === 'review' && method === 'POST') {
		const body = await readJson(event);
		const raw = Array.isArray(body.results) ? body.results : Array.isArray(body.reviews) ? body.reviews : [];
		const results = (raw as unknown[])
			.filter((r): r is { key: string; known?: unknown } => !!r && typeof r === 'object' && typeof (r as { key?: unknown }).key === 'string')
			.slice(0, 500)
			.map((r) => {
				const o = r as { key: string; known?: unknown; correct?: unknown };
				const known = o.known === true || o.correct === true;
				return { key: o.key, known };
			});
		if (results.length === 0) return err('Hiányzik a results lista.', 400);
		const { saveCardProgress } = await import('$lib/server/curriculum/curriculum');
		await saveCardProgress(db, user.id, results);
		return ok({ ok: true, saved: results.length });
	}

	/* Haladás: összesítő */
	if (head === 'progress' && second === 'stats' && method === 'GET') {
		const lessons = await db.prepare(`SELECT COUNT(*) AS n FROM lesson_progress WHERE user_id = ? AND done = 1`).bind(user.id).first<{ n: number }>().catch(() => ({ n: 0 }));
		const cards = await db.prepare(`SELECT COUNT(*) AS n FROM card_progress WHERE user_id = ?`).bind(user.id).first<{ n: number }>().catch(() => ({ n: 0 }));
		const decks = await db.prepare(`SELECT COUNT(*) AS n FROM decks WHERE user_id = ?`).bind(user.id).first<{ n: number }>().catch(() => ({ n: 0 }));
		return ok({ stats: { lessonsDone: lessons?.n ?? 0, cardsTouched: cards?.n ?? 0, decks: decks?.n ?? 0, streak: user.streak ?? 0, xp: user.xp ?? 0 } });
	}
	return null;
}

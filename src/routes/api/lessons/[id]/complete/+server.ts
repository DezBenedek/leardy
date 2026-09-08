import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, logActivity, requireUser } from '$lib/server/db';

// POST /api/lessons/[id]/complete { kind: 'theory'|'cards'|'quiz', score?, done? }
// - done=false: visszavonás (csak elméletnél), XP nem jár.
// - XP csak az első teljesítéskor / kvíznél csak a javulásért jár (nincs farmolás).
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const lesson = await db.prepare(`SELECT id FROM lessons WHERE id = ?`).bind(id).first();
	if (!lesson) return json({ error: 'Nincs ilyen lecke.' }, { status: 404 });
	let body: { kind?: unknown; score?: unknown; done?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const kind = String(body.kind ?? '');
	if (kind !== 'theory' && kind !== 'cards' && kind !== 'quiz') {
		return json({ error: 'Hibás modul.' }, { status: 400 });
	}
	const done = body.done !== false;
	if (!done && kind !== 'theory') {
		return json({ error: 'Visszavonni csak az elméletet lehet.' }, { status: 400 });
	}
	const score = Math.max(0, Math.min(100, Number(body.score ?? 0) || 0));

	const prev = await db
		.prepare(
			`SELECT theory_done, cards_done, quiz_done, quiz_best FROM lesson_progress
			 WHERE user_id = ? AND lesson_id = ?`
		)
		.bind(user.id, id)
		.first<{ theory_done: number; cards_done: number; quiz_done: number; quiz_best: number }>();

	if (!done) {
		await db
			.prepare(
				`INSERT INTO lesson_progress (user_id, lesson_id, theory_done, cards_done, quiz_done, quiz_best, updated_at)
				 VALUES (?, ?, 0, 0, 0, 0, ?)
				 ON CONFLICT(user_id, lesson_id) DO UPDATE SET theory_done = 0, updated_at = excluded.updated_at`
			)
			.bind(user.id, id, Date.now())
			.run();
		const me = await db
			.prepare(`SELECT COALESCE(xp,0) AS xp, COALESCE(streak,0) AS streak FROM users WHERE id = ?`)
			.bind(user.id)
			.first<{ xp: number; streak: number }>();
		return json({ ok: true, xp: me?.xp ?? 0, streak: me?.streak ?? 0 });
	}

	let gain = 0;
	if (kind === 'theory' && !(prev && prev.theory_done === 1)) gain = 5;
	if (kind === 'cards' && !(prev && prev.cards_done === 1)) gain = 10;
	if (kind === 'quiz') gain = Math.max(0, Math.round((score - (prev?.quiz_best ?? 0)) / 10));

	await db
		.prepare(
			`INSERT INTO lesson_progress (user_id, lesson_id, theory_done, cards_done, quiz_done, quiz_best, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(user_id, lesson_id) DO UPDATE SET
				theory_done = MAX(theory_done, excluded.theory_done),
				cards_done = MAX(cards_done, excluded.cards_done),
				quiz_done = MAX(quiz_done, excluded.quiz_done),
				quiz_best = MAX(quiz_best, excluded.quiz_best),
				updated_at = excluded.updated_at`
		)
		.bind(
			user.id, id,
			kind === 'theory' ? 1 : 0, kind === 'cards' ? 1 : 0, kind === 'quiz' ? 1 : 0,
			kind === 'quiz' ? score : 0, Date.now()
		)
		.run();
	const { xp, streak } = await logActivity(db, user.id, gain, 0);
	return json({ ok: true, xp, streak });
};

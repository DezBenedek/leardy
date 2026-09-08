import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, logActivity, requireUser } from '$lib/server/db';

// POST /api/lessons/[id]/complete { kind: 'theory'|'cards'|'quiz', score? } — modul készre jelölés + XP.
const XP: Record<string, number> = { theory: 5, cards: 10, quiz: 0 };

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const lesson = await db.prepare(`SELECT id FROM lessons WHERE id = ?`).bind(id).first();
	if (!lesson) return json({ error: 'Nincs ilyen lecke.' }, { status: 404 });
	let body: { kind?: unknown; score?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const kind = String(body.kind ?? '');
	if (kind !== 'theory' && kind !== 'cards' && kind !== 'quiz') {
		return json({ error: 'Hibás modul.' }, { status: 400 });
	}
	const score = Math.max(0, Math.min(100, Number(body.score ?? 0) || 0));
	const gain = kind === 'quiz' ? Math.round(score / 10) : (XP[kind] ?? 0);
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

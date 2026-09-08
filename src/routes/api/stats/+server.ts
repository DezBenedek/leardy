import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser, todayStr } from '$lib/server/db';

// GET /api/stats — dashboard: XP, széria, heti hőtérkép, esedékesek, folytatás.
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });

	const me = await db
		.prepare(`SELECT COALESCE(xp,0) AS xp, COALESCE(streak,0) AS streak, COALESCE(role,'student') AS role FROM users WHERE id = ?`)
		.bind(user.id)
		.first<{ xp: number; streak: number; role: string }>();

	const days: string[] = [];
	for (let i = 6; i >= 0; i--) days.push(todayStr(-i));
	const acts = await db
		.prepare(`SELECT day, xp, reviews FROM activity WHERE user_id = ? AND day >= ?`)
		.bind(user.id, days[0])
		.all<{ day: string; xp: number; reviews: number }>();
	const byDay = new Map((acts.results ?? []).map((a) => [a.day, a]));
	const week = days.map((day) => ({ day, xp: byDay.get(day)?.xp ?? 0, reviews: byDay.get(day)?.reviews ?? 0 }));

	const enrolled = await db
		.prepare(`SELECT COUNT(*) AS c FROM enrollments WHERE user_id = ?`)
		.bind(user.id)
		.first<{ c: number }>();
	const hasEnroll = (enrolled?.c ?? 0) > 0;
	const dueRows = hasEnroll
		? await db
				.prepare(
					`SELECT t.type AS type, COUNT(*) AS c FROM flashcards f
					 JOIN lessons l ON l.id = f.lesson_id JOIN topics t ON t.id = l.topic_id
					 JOIN enrollments e ON e.topic_id = t.id AND e.user_id = ?
					 LEFT JOIN user_progress p ON p.user_id = ? AND p.flashcard_id = f.id
					 WHERE (p.next_review_date IS NULL OR p.next_review_date = '' OR p.next_review_date <= ?)
					 GROUP BY t.type`
				)
				.bind(user.id, user.id, todayStr())
				.all<{ type: string; c: number }>()
		: await db
				.prepare(
					`SELECT t.type AS type, COUNT(*) AS c FROM flashcards f
					 JOIN lessons l ON l.id = f.lesson_id JOIN topics t ON t.id = l.topic_id
					 LEFT JOIN user_progress p ON p.user_id = ? AND p.flashcard_id = f.id
					 WHERE t.is_public = 1 AND (p.next_review_date IS NULL OR p.next_review_date = '' OR p.next_review_date <= ?)
					 GROUP BY t.type`
				)
				.bind(user.id, todayStr())
				.all<{ type: string; c: number }>();
	let language = 0, general = 0;
	for (const r of dueRows.results ?? []) {
		if (r.type === 'language') language = r.c;
		else general += r.c;
	}

	const done = await db
		.prepare(
			`SELECT COUNT(*) AS c FROM lesson_progress
			 WHERE user_id = ? AND theory_done = 1 AND (cards_done = 1 OR quiz_done = 1)`
		)
		.bind(user.id)
		.first<{ c: number }>();
	const last = await db
		.prepare(
			`SELECT l.id, l.title, t.title AS topic_title FROM lesson_progress p
			 JOIN lessons l ON l.id = p.lesson_id JOIN topics t ON t.id = l.topic_id
			 WHERE p.user_id = ? ORDER BY p.updated_at DESC LIMIT 1`
		)
		.bind(user.id)
		.first<{ id: string; title: string; topic_title: string }>();

	return json({
		xp: me?.xp ?? 0,
		streak: me?.streak ?? 0,
		role: me?.role ?? 'student',
		week,
		due: { mind: language + general, language, general },
		lessonsDone: done?.c ?? 0,
		lastLesson: last ?? null
	});
};

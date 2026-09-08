import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, logActivity, nextSrsInterval, requireUser, todayStr } from '$lib/server/db';
import { CATS } from '$lib/server/study';

// GET /api/review?filter=mind|language|general&topics=id,..&lessons=id,.. — esedékes kártyák.
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const filter = event.url.searchParams.get('filter') ?? 'mind';
	const limit = Math.max(1, Math.min(100, Number(event.url.searchParams.get('limit') ?? 50) || 50));
	const topicIds = (event.url.searchParams.get('topics') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
	const lessonIds = (event.url.searchParams.get('lessons') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
	// Presetekhez: tantárgy-kategóriák (az új leckék automatikusan bekerülnek).
	const catIds = (event.url.searchParams.get('categories') ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter((c) => CATS.includes(c));

	// Ha még semmire nem iratkozott fel: a nyilvános témakörök automatikusan bekerülnek.
	const n = await db
		.prepare(`SELECT COUNT(*) AS c FROM enrollments WHERE user_id = ?`)
		.bind(user.id)
		.first<{ c: number }>();
	if ((n?.c ?? 0) === 0) {
		await db
			.prepare(
				`INSERT OR IGNORE INTO enrollments (user_id, topic_id, enrolled_at)
				 SELECT ?, id, ? FROM topics WHERE is_public = 1`
			)
			.bind(user.id, Date.now())
			.run();
	}
	const typeCond = filter === 'language' ? 'AND t.type = \'language\'' : filter === 'general' ? 'AND t.type = \'general\'' : '';
	const scopeConds: string[] = [];
	const scopeArgs: unknown[] = [];
	if (topicIds.length > 0) {
		scopeConds.push(`AND t.id IN (${topicIds.map(() => '?').join(',')})`);
		scopeArgs.push(...topicIds);
	}
	if (lessonIds.length > 0) {
		scopeConds.push(`AND l.id IN (${lessonIds.map(() => '?').join(',')})`);
		scopeArgs.push(...lessonIds);
	}
	if (catIds.length > 0) {
		scopeConds.push(`AND t.category IN (${catIds.map(() => '?').join(',')})`);
		scopeArgs.push(...catIds);
	}
	const rows = await db
		.prepare(
			`SELECT f.id, f.lesson_id, f.front_text, f.back_text, f.audio_url, f.image_url, f.ipa,
				l.topic_id, t.title AS topic_title, t.type AS topic_type,
				COALESCE(p.ease_interval, 0) AS ease_interval, COALESCE(p.status, 'new') AS status
			 FROM flashcards f
			 JOIN lessons l ON l.id = f.lesson_id
			 JOIN topics t ON t.id = l.topic_id
			 JOIN enrollments e ON e.topic_id = t.id AND e.user_id = ?
			 LEFT JOIN user_progress p ON p.user_id = ? AND p.flashcard_id = f.id
			 WHERE (p.next_review_date IS NULL OR p.next_review_date = '' OR p.next_review_date <= ?) ${typeCond} ${scopeConds.join(' ')}
			 ORDER BY CASE WHEN p.status IS NULL OR p.status = 'new' THEN 0 ELSE 1 END,
				COALESCE(p.ease_interval, 0) ASC, RANDOM()
			 LIMIT ?`
		)
		.bind(user.id, user.id, todayStr(), ...scopeArgs, limit)
		.all();
	return json({ cards: rows.results ?? [] });
};

// POST /api/review { flashcard_id, known, cram? } — 2 gombos értékelés.
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let body: { flashcard_id?: unknown; known?: unknown; cram?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const flashcard_id = String(body.flashcard_id ?? '');
	const known = body.known === true;
	const cram = body.cram === true;
	if (!flashcard_id) return json({ error: 'Hiányzó kártya.' }, { status: 400 });
	const card = await db.prepare(`SELECT id FROM flashcards WHERE id = ?`).bind(flashcard_id).first();
	if (!card) return json({ error: 'Nincs ilyen kártya.' }, { status: 404 });

	if (cram) {
		// Magolás: SRS-időzítés változatlan, csak XP + aktivitás.
		const { xp, streak } = await logActivity(db, user.id, known ? 2 : 0, 1);
		return json({ ok: true, xp, streak, cram: true });
	}
	const prev = await db
		.prepare(`SELECT ease_interval FROM user_progress WHERE user_id = ? AND flashcard_id = ?`)
		.bind(user.id, flashcard_id)
		.first<{ ease_interval: number }>();
	const interval = nextSrsInterval(prev?.ease_interval ?? 0, known);
	await db
		.prepare(
			`INSERT INTO user_progress (user_id, flashcard_id, ease_interval, next_review_date, status, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(user_id, flashcard_id) DO UPDATE SET
				ease_interval = excluded.ease_interval, next_review_date = excluded.next_review_date,
				status = excluded.status, updated_at = excluded.updated_at`
		)
		.bind(user.id, flashcard_id, interval, todayStr(interval), known ? 'known' : 'learning', Date.now())
		.run();
	const { xp, streak } = await logActivity(db, user.id, known ? 5 : 1, 1);
	return json({ ok: true, xp, streak, interval });
};

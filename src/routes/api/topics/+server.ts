import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, newId, requireUser } from '$lib/server/db';

const CATS = ['Nyelv', 'Reál', 'Humán'];

// GET /api/topics?category=&type=&q= — nyilvános + saját témakörök, darabszámokkal.
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	const category = event.url.searchParams.get('category') ?? '';
	const type = event.url.searchParams.get('type') ?? '';
	const q = (event.url.searchParams.get('q') ?? '').trim();

	const conds: string[] = [];
	const args: unknown[] = [];
	if (user) {
		conds.push('(t.is_public = 1 OR t.author_id = ?)');
		args.push(user.id);
	} else {
		conds.push('t.is_public = 1');
	}
	if (category && CATS.includes(category)) {
		conds.push('t.category = ?');
		args.push(category);
	}
	if (type === 'language' || type === 'general') {
		conds.push('t.type = ?');
		args.push(type);
	}
	if (q) {
		conds.push('t.title LIKE ?');
		args.push(`%${q}%`);
	}
	const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
	const rows = await db
		.prepare(
			`SELECT t.id, t.title, t.category, t.type, t.is_public,
				(SELECT COUNT(*) FROM lessons l WHERE l.topic_id = t.id) AS lessons,
				(SELECT COUNT(*) FROM flashcards f JOIN lessons l ON l.id = f.lesson_id WHERE l.topic_id = t.id) AS cards,
				${user ? '(SELECT COUNT(*) FROM enrollments e WHERE e.user_id = ? AND e.topic_id = t.id) AS enrolled' : '0 AS enrolled'}
			 FROM topics t ${where} ORDER BY t.created_at DESC, t.title`
		)
		.bind(...(user ? [user.id, ...args] : args))
		.all();
	return json({ topics: rows.results ?? [] });
};

// POST /api/topics — új témakör (bejelentkezve; tanár + diák is létrehozhat sajátot).
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let body: { title?: unknown; category?: unknown; type?: unknown; is_public?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const title = String(body.title ?? '').trim();
	const category = CATS.includes(String(body.category)) ? String(body.category) : 'Humán';
	const type = body.type === 'language' ? 'language' : 'general';
	const is_public = body.is_public === false || body.is_public === 0 ? 0 : 1;
	if (title.length < 3) return json({ error: 'Adj legalább 3 karakteres címet.' }, { status: 400 });
	const id = newId();
	await db
		.prepare(
			`INSERT INTO topics (id, title, category, type, is_public, author_id, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(id, title, category, type, is_public, user.id, Date.now())
		.run();
	return json({ topic: { id, title, category, type, is_public } }, { status: 201 });
};

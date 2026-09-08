import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, newId, requireUser } from '$lib/server/db';

// POST /api/topics/[id]/exam/attempt — témazáró-eredmény naplózása.
// { score, total, mistakes: { [lessonId]: { wrong, total } } }
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const topic = await db.prepare(`SELECT id FROM topics WHERE id = ?`).bind(id).first();
	if (!topic) return json({ error: 'Nincs ilyen témakör.' }, { status: 404 });
	let body: { score?: unknown; total?: unknown; mistakes?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const score = Math.max(0, Number(body.score ?? 0) || 0);
	const total = Math.max(1, Number(body.total ?? 0) || 0);
	const raw = (body.mistakes ?? {}) as Record<string, { wrong?: unknown; total?: unknown }>;
	const clean: Record<string, { wrong: number; total: number }> = {};
	for (const [lid, m] of Object.entries(raw).slice(0, 50)) {
		if (!m || typeof m !== 'object') continue;
		const wrong = Math.max(0, Number(m.wrong ?? 0) || 0);
		if (wrong <= 0) continue;
		clean[String(lid).slice(0, 64)] = { wrong, total: Math.max(0, Number(m.total ?? 0) || 0) };
	}
	await db
		.prepare(
			`INSERT INTO exam_attempts (id, user_id, topic_id, score, total, mistakes_json, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(newId(), user.id, id, score, total, JSON.stringify(clean), Date.now())
		.run();
	return json({ ok: true }, { status: 201 });
};

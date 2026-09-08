import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';

// POST /api/topics/[id]/enroll — felvétel a saját profilhoz (önálló tanulás).
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const topic = await db.prepare(`SELECT id FROM topics WHERE id = ?`).bind(id).first();
	if (!topic) return json({ error: 'Nincs ilyen témakör.' }, { status: 404 });
	await db
		.prepare(`INSERT OR IGNORE INTO enrollments (user_id, topic_id, enrolled_at) VALUES (?, ?, ?)`)
		.bind(user.id, id, Date.now())
		.run();
	return json({ ok: true });
};

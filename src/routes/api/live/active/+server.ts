import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { ensureLiveSchema } from '$lib/server/live';

/* Aktív élő dolgozatok: a saját termek (tanár vagy tag) lobby/live állapotú munkamenetei. */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureLiveSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });

	const rooms = await db
		.prepare(
			`SELECT id FROM classrooms WHERE teacher_id = ?
			 UNION SELECT classroom_id AS id FROM classroom_members WHERE user_id = ?`
		)
		.bind(user.id, user.id)
		.all<{ id: string }>();
	const ids = (rooms.results ?? []).map((r) => r.id).filter(Boolean);
	if (ids.length === 0) return json({ sessions: [] });
	const ph = ids.map(() => '?').join(',');
	const res = await db
		.prepare(
			`SELECT s.id, s.classroom_id, c.name AS classroom_name, s.title, s.status, s.created_at
			 FROM live_sessions s JOIN classrooms c ON c.id = s.classroom_id
			 WHERE s.classroom_id IN (${ph}) AND s.status IN ('lobby', 'live')
			 ORDER BY s.created_at DESC LIMIT 20`
		)
		.bind(...ids)
		.all<{ id: string; classroom_id: string; classroom_name: string; title: string; status: string; created_at: number }>();
	return json({ sessions: res.results ?? [] });
};

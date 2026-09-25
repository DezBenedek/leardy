import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { canAccessLive, dealItems, getLiveByCode } from '$lib/server/live';

// POST /api/live/[code]/join — csatlakozás a menethez (váróban is, élőben is).
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const s = await getLiveByCode(db, event.params.code ?? '');
	if (!s) return json({ error: 'Nincs ilyen kódú élő dolgozat.' }, { status: 404 });
	if (s.status === 'finished') return json({ error: 'Ez a menet már véget ért.' }, { status: 410 });
	const access = await canAccessLive(db, s, user.id);
	if (access === 'teacher' || (user.is_admin ?? 0) === 1) {
		return json({ ok: true, role: 'teacher', status: s.status });
	}
	if (access !== 'member') return json({ error: 'Nem vagy tagja ennek az osztálynak.' }, { status: 403 });
	await db
		.prepare(
			`INSERT OR IGNORE INTO live_participants (session_id, user_id, name, joined_at, finished_at, score)
			 VALUES (?, ?, ?, ?, 0, 0)`
		)
		.bind(s.id, user.id, user.name, Date.now())
		.run();
	if (s.status === 'live') {
		await dealItems(db, s, user.id);
	}
	return json({ ok: true, role: 'student', status: s.status });
};

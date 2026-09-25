import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { finishSession, getLiveByCode, transition } from '$lib/server/live';

// POST /api/live/[code]/finish — tanári lezárás: mindenki pontozva, beadva.
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const s = await getLiveByCode(db, event.params.code ?? '');
	if (!s) return json({ error: 'Nincs ilyen kódú élő dolgozat.' }, { status: 404 });
	if (s.teacher_id !== user.id && (user.is_admin ?? 0) !== 1) {
		return json({ error: 'Nincs jogosultságod.' }, { status: 403 });
	}
	const cur = await transition(db, s);
	await finishSession(db, cur);
	return json({ ok: true });
};

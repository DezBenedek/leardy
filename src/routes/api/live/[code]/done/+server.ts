import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { finishStudent, getLiveByCode, isLiveParticipant } from '$lib/server/live';

// POST /api/live/[code]/done — diák befejezi a saját menetét (pontozás + beadás).
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const s = await getLiveByCode(db, event.params.code ?? '');
	if (!s) return json({ error: 'Nincs ilyen kódú élő dolgozat.' }, { status: 404 });
	if (!(await isLiveParticipant(db, s.id, user.id))) {
		return json({ error: 'Nem vagy bent ebben a menetben.' }, { status: 403 });
	}
	if (s.status !== 'live' && s.status !== 'finished') {
		return json({ error: 'A menet még nem indult el.' }, { status: 409 });
	}
	const r = await finishStudent(db, s, user.id);
	return json({ ok: true, ...r });
};

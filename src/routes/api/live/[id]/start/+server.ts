import { json, type RequestHandler } from '@sveltejs/kit';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { getDb, requireUser } from '$lib/server/db';
import { ensureLiveSchema, getClassRole, callLiveRoom } from '$lib/server/live';

/* Indítás: csak tanár. DO start esemény + D1 státusz live. */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureLiveSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if (!id) return json({ error: 'Hibás kérés.' }, { status: 400 });

	const session = await db
		.prepare(`SELECT id, classroom_id FROM live_sessions WHERE id = ?`)
		.bind(id)
		.first<{ id: string; classroom_id: string }>();
	if (!session) return json({ error: 'Nincs ilyen dolgozat.' }, { status: 404 });
	const role = await getClassRole(db, session.classroom_id, user.id);
	if (!role.exists) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (!role.isTeacher) return json({ error: 'Csak az osztály tanára indíthat.' }, { status: 403 });

	const ns = (event.platform?.env as unknown as { LIVE?: DurableObjectNamespace } | undefined)?.LIVE;
	if (!ns) return json({ error: 'Az élő modul nem elérhető.' }, { status: 503 });
	try {
		await callLiveRoom(ns, id, { type: 'start' });
	} catch {
		return json({ error: 'Az indítás most nem sikerült.' }, { status: 503 });
	}
	await db
		.prepare(`UPDATE live_sessions SET status = 'live', started_at = COALESCE(started_at, ?) WHERE id = ?`)
		.bind(Date.now(), id)
		.run();
	return json({ ok: true });
};

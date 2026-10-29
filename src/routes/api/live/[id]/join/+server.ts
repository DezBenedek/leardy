import { json, type RequestHandler } from '@sveltejs/kit';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { getDb, requireUser } from '$lib/server/db';
import { ensureLiveSchema, getClassRole, callLiveRoom } from '$lib/server/live';

/* Csatlakozás: diák vagy tanár a teremből. Csak DO join esemény, D1 írás nincs. */
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
	if (!role.isMember) return json({ error: 'Nem vagy az osztály tagja.' }, { status: 403 });

	const ns = (event.platform?.env as unknown as { LIVE?: DurableObjectNamespace } | undefined)?.LIVE;
	if (!ns) return json({ error: 'Az élő modul nem elérhető.' }, { status: 503 });
	try {
		await callLiveRoom(ns, id, {
			type: 'join',
			userId: user.id,
			name: user.name || 'Diák',
			role: role.isTeacher ? 'teacher' : 'student'
		});
	} catch {
		return json({ error: 'A csatlakozás most nem sikerült.' }, { status: 503 });
	}
	return json({ ok: true });
};

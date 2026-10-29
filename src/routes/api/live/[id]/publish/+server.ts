import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { ensureLiveSchema, getClassRole, callLiveRoom, type LiveConfig, type LiveQuestion } from '$lib/server/live';
import { fireNotify, notifyClassroom } from '$lib/server/push';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

/* Piszkozat meghirdetése: csak az osztály tanára, csak draft állapotból.
   A tárolt kérdéssorból friss DO-szoba készül, a státusz lobby lesz,
   és az osztály push értesítést kap. */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureLiveSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if (!id) return json({ error: 'Hibás kérés.' }, { status: 400 });

	const session = await db
		.prepare(`SELECT id, classroom_id, teacher_id, title, config_json, status FROM live_sessions WHERE id = ?`)
		.bind(id)
		.first<{ id: string; classroom_id: string; teacher_id: string; title: string; config_json: string; status: string }>();
	if (!session) return json({ error: 'Nincs ilyen dolgozat.' }, { status: 404 });
	const role = await getClassRole(db, session.classroom_id, user.id);
	if (!role.exists) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (!role.isTeacher) return json({ error: 'Csak az osztály tanára hirdethet meg.' }, { status: 403 });
	if (session.status !== 'draft') return json({ error: 'Ez a dolgozat már meg van hirdetve.' }, { status: 409 });

	let stored: { config?: LiveConfig; questions?: LiveQuestion[] } = {};
	try {
		stored = JSON.parse(session.config_json ?? '{}') as typeof stored;
	} catch {
		stored = {};
	}
	if (!stored.config || !Array.isArray(stored.questions) || stored.questions.length === 0) {
		return json({ error: 'A piszkozat kérdéssora hiányzik.' }, { status: 422 });
	}

	const ns = (event.platform?.env as unknown as { LIVE?: DurableObjectNamespace } | undefined)?.LIVE;
	if (ns) {
		try {
			await callLiveRoom(ns, id, { type: 'init', config: stored.config, questions: stored.questions });
		} catch {
			// DO hiba a meghirdetést nem akaszthatja meg
		}
	}
	await db
		.prepare(`UPDATE live_sessions SET status = 'lobby', started_at = NULL WHERE id = ?`)
		.bind(id)
		.run();

	fireNotify(
		event,
		notifyClassroom(db, {
			classroomId: session.classroom_id,
			excludeUserId: user.id,
			title: 'Élő dolgozat indult',
			body: session.title || 'Élő dolgozat',
			url: `/elo/${id}`,
			tag: `live-${id}`,
			kind: 'task'
		})
	);
	return json({ ok: true });
};

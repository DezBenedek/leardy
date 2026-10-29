import { json, type RequestHandler } from '@sveltejs/kit';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { getDb, requireUser } from '$lib/server/db';
import { ensureLiveSchema, getClassRole, fetchLiveSnapshot } from '$lib/server/live';

/* Munkamenet + DO pillanatkép: D1-ből session, DO-ból élő állapot.
   Ha a DO üres, a D1 config alapján adunk vissza alap snapshotot.
   Piszkozatot csak az osztály tanára nyithat meg. */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureLiveSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if (!id) return json({ error: 'Hibás kérés.' }, { status: 400 });

	const session = await db
		.prepare(
			`SELECT id, classroom_id, teacher_id, title, config_json, status, created_at, started_at, finished_at
			 FROM live_sessions WHERE id = ?`
		)
		.bind(id)
		.first<{
			id: string;
			classroom_id: string;
			teacher_id: string;
			title: string;
			config_json: string;
			status: string;
			created_at: number | null;
			started_at: number | null;
			finished_at: number | null;
		}>();
	if (!session) return json({ error: 'Nincs ilyen dolgozat.' }, { status: 404 });
	const role = await getClassRole(db, session.classroom_id, user.id);
	if (!role.isMember) return json({ error: 'Nem vagy az osztály tagja.' }, { status: 403 });
	if (session.status === 'draft' && !role.isTeacher) {
		return json({ error: 'Nincs ilyen dolgozat.' }, { status: 404 });
	}

	let stored: { config?: unknown; questions?: unknown[] } = {};
	try {
		stored = JSON.parse(session.config_json ?? '{}') as typeof stored;
	} catch {
		stored = {};
	}

	const ns = (event.platform?.env as unknown as { LIVE?: DurableObjectNamespace } | undefined)?.LIVE;
	if (ns) {
		const roleParam = role.isTeacher ? 'teacher' : 'student';
		const live = await fetchLiveSnapshot(ns, id, user.id, roleParam);
		if (live) return json({ session, live });
	}
	const questions = Array.isArray(stored.questions) ? stored.questions : [];
	return json({
		session,
		live: {
			ok: true,
			status: session.status,
			currentIndex: 0,
			total: questions.length,
			questions,
			participants: [],
			myAnswers: {},
			fallback: true
		}
	});
};

/* Piszkozat törlése: csak az osztály tanára, csak draft állapotban.
   Meghirdetett vagy lezárt dolgozat nem törölhető. */
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureLiveSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if (!id) return json({ error: 'Hibás kérés.' }, { status: 400 });

	const session = await db
		.prepare(`SELECT id, classroom_id, status FROM live_sessions WHERE id = ?`)
		.bind(id)
		.first<{ id: string; classroom_id: string; status: string }>();
	if (!session) return json({ error: 'Nincs ilyen dolgozat.' }, { status: 404 });
	const role = await getClassRole(db, session.classroom_id, user.id);
	if (!role.exists) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (!role.isTeacher) return json({ error: 'Csak az osztály tanára törölhet.' }, { status: 403 });
	if (session.status !== 'draft') {
		return json({ error: 'Csak piszkozat törölhető.' }, { status: 409 });
	}
	await db.batch([
		db.prepare(`DELETE FROM live_results WHERE session_id = ?`).bind(id),
		db.prepare(`DELETE FROM live_sessions WHERE id = ?`).bind(id)
	]);
	return json({ ok: true });
};

import { json, type RequestHandler } from '@sveltejs/kit';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { getDb, requireUser } from '$lib/server/db';
import { ensureLiveSchema, getClassRole, callLiveRoom } from '$lib/server/live';

/* Lezárás: csak tanár. DO finish esemény, végeredmények D1 live_results-be, státusz done. */
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
	if (!role.isTeacher) return json({ error: 'Csak az osztály tanára zárhat le.' }, { status: 403 });

	const ns = (event.platform?.env as unknown as { LIVE?: DurableObjectNamespace } | undefined)?.LIVE;
	if (!ns) return json({ error: 'Az élő modul nem elérhető.' }, { status: 503 });
	let results: { userId: string; name: string; score: number; total: number; answered: number }[] = [];
	try {
		const { status, data } = await callLiveRoom(ns, id, { type: 'finish' });
		if (status < 200 || status >= 300) return json({ error: 'A lezárás most nem sikerült.' }, { status: 502 });
		if (Array.isArray(data['results'])) {
			results = data['results'] as typeof results;
		}
	} catch {
		return json({ error: 'A lezárás most nem sikerült.' }, { status: 503 });
	}

	const now = Date.now();
	await db
		.prepare(`UPDATE live_sessions SET status = 'done', finished_at = ? WHERE id = ?`)
		.bind(now, id)
		.run();
	if (results.length > 0) {
		await db.batch(
			results.slice(0, 500).map((r) =>
				db
					.prepare(
						`INSERT INTO live_results (session_id, user_id, display_name, score, total, finished_at)
						 VALUES (?, ?, ?, ?, ?, ?)
						 ON CONFLICT(session_id, user_id) DO UPDATE SET
						 display_name = excluded.display_name, score = excluded.score,
						 total = excluded.total, finished_at = excluded.finished_at`
					)
					.bind(
						id,
						String(r.userId ?? ''),
						String(r.name ?? '').slice(0, 80),
						Math.max(0, Math.floor(Number(r.score) || 0)),
						Math.max(0, Math.floor(Number(r.total) || 0)),
						now
					)
			)
		);
	}
	return json({ ok: true, results });
};

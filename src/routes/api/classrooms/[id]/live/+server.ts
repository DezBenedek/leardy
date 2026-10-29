import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { ensureLiveSchema, getClassRole } from '$lib/server/live';

/* Élő dolgozatok a tanterem falára: a tanár az összes eddigit látja
   (aktív elöl, piszkozatok, lezártak dátummal), a diák csak az éppen élőt.
   Válasz: { sessions: [{ id, title, status, created_at, total, done, source, pacing, orderMode, playMode }] } */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureLiveSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroomId = event.params.id ?? '';
	if (!classroomId) return json({ error: 'Hibás kérés.' }, { status: 400 });

	const role = await getClassRole(db, classroomId, user.id);
	if (!role.exists) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (!role.isMember) return json({ error: 'Nem vagy az osztály tagja.' }, { status: 403 });

	const rows = role.isTeacher
		? await db
				.prepare(
					`SELECT s.id, s.title, s.status, s.created_at, s.config_json,
						COALESCE(r.c, 0) AS done
					 FROM live_sessions s
					 LEFT JOIN (SELECT session_id, COUNT(*) AS c FROM live_results GROUP BY session_id) r
						ON r.session_id = s.id
					 WHERE s.classroom_id = ?
					 ORDER BY s.created_at DESC LIMIT 20`
				)
				.bind(classroomId)
				.all<{ id: string; title: string; status: string; created_at: number; config_json: string; done: number }>()
		: await db
				.prepare(
					`SELECT id, title, status, created_at, config_json, 0 AS done
					 FROM live_sessions
					 WHERE classroom_id = ? AND status IN ('lobby', 'live')
					 ORDER BY created_at DESC LIMIT 5`
				)
				.bind(classroomId)
				.all<{ id: string; title: string; status: string; created_at: number; config_json: string; done: number }>();

	const sessions = (rows.results ?? []).map((row) => {
		let total = 0;
		let source: 'quiz' | 'deck' = 'quiz';
		let pacing: 'self' | 'synced' = 'self';
		let orderMode: 'same' | 'shuffled' = 'same';
		let playMode: 'solo' | 'stage' = 'solo';
		try {
			const stored = JSON.parse(row.config_json ?? '{}') as {
				questions?: unknown[];
				config?: {
					count?: unknown;
					lessonIds?: unknown;
					deckIds?: unknown;
					pacing?: unknown;
					orderMode?: unknown;
					playMode?: unknown;
				};
			};
			if (Array.isArray(stored.questions)) total = stored.questions.length;
			else if (typeof stored.config?.count === 'number') total = stored.config.count;
			const cfg = stored.config;
			if (cfg) {
				const hasDecks = Array.isArray(cfg.deckIds) && cfg.deckIds.length > 0;
				const hasLessons = Array.isArray(cfg.lessonIds) && cfg.lessonIds.length > 0;
				source = hasDecks && !hasLessons ? 'deck' : 'quiz';
				if (cfg.pacing === 'synced') pacing = 'synced';
				if (cfg.orderMode === 'shuffled') orderMode = 'shuffled';
				if (cfg.playMode === 'stage') playMode = 'stage';
			}
		} catch {
			total = 0;
		}
		return {
			id: row.id,
			title: row.title || 'Élő dolgozat',
			status: row.status === 'live' || row.status === 'done' || row.status === 'draft' ? row.status : 'lobby',
			created_at: row.created_at ?? 0,
			total,
			done: row.done ?? 0,
			source,
			pacing,
			orderMode,
			playMode
		};
	});
	return json({ sessions });
};

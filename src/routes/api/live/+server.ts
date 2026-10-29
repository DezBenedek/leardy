import { json, type RequestHandler } from '@sveltejs/kit';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { getDb, requireUser } from '$lib/server/db';
import { ensureLiveSchema, buildLiveQuestions, feasibility, getClassRole, callLiveRoom, type LiveConfig } from '$lib/server/live';
import { fireNotify, notifyClassroom } from '$lib/server/push';

/* Név nélkül is indítható: ilyenkor az alapértelmezett címet kapja.
   Dátumot szándékosan nem teszünk bele: a fal és a push úgyis mutatja. */
function autoLiveTitle(): string {
	return 'Élő dolgozat';
}

/* Élő dolgozat indítása: csak az osztály tanára.
   Body: { classroomId, title?, config: { lessonIds, deckIds?, orderMode, count, pacing, playMode } } */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureLiveSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });

	let body: { classroomId?: unknown; title?: unknown; config?: unknown; draft?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const classroomId = String(body.classroomId ?? '').trim();
	const rawTitle = String(body.title ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
	const title = rawTitle || autoLiveTitle();
	if (!classroomId) return json({ error: 'Hiányzó osztály.' }, { status: 400 });

	const role = await getClassRole(db, classroomId, user.id);
	if (!role.exists) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (!role.isTeacher) return json({ error: 'Csak az osztály tanára indíthat élő dolgozatot.' }, { status: 403 });

	const raw = (body.config ?? {}) as Partial<LiveConfig>;
	const lessonIds = Array.isArray(raw.lessonIds) ? raw.lessonIds.map(String).filter(Boolean).slice(0, 20) : [];
	const deckIds = Array.isArray(raw.deckIds) ? raw.deckIds.map(String).filter(Boolean).slice(0, 20) : [];
	if (lessonIds.length === 0 && deckIds.length === 0) {
		return json({ error: 'Válassz legalább egy leckét vagy csomagot!' }, { status: 400 });
	}
	const draft = body.draft === true;
	const config: LiveConfig = {
		lessonIds,
		deckIds,
		orderMode: raw.orderMode === 'shuffled' ? 'shuffled' : 'same',
		count: Math.max(1, Math.min(100, Math.floor(Number(raw.count) || 10))),
		pacing: raw.pacing === 'synced' ? 'synced' : 'self',
		playMode: raw.playMode === 'stage' ? 'stage' : 'solo'
	};

	const all = await buildLiveQuestions(db, config.lessonIds, config.deckIds);
	const check = feasibility(all.length, config.count);
	if (!check.ok) return json({ error: check.message }, { status: 400 });
	// Sorrend: same módban egyszer keverünk, shuffled módban a DO kever fejenként.
	const pool = [...all];
	if (config.orderMode === 'same') {
		for (let i = pool.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[pool[i], pool[j]] = [pool[j], pool[i]];
		}
	}
	const questions = pool.slice(0, check.effective);
	const effectiveConfig: LiveConfig = { ...config, count: questions.length };

	const id = crypto.randomUUID();
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO live_sessions (id, classroom_id, teacher_id, title, config_json, status, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(id, classroomId, user.id, title, JSON.stringify({ config: effectiveConfig, questions }), draft ? 'draft' : 'lobby', now)
		.run();

	const ns = (event.platform?.env as unknown as { LIVE?: DurableObjectNamespace } | undefined)?.LIVE;
	if (ns) {
		try {
			await callLiveRoom(ns, id, { type: 'init', config: effectiveConfig, questions });
		} catch {
			// DO hiba az indulást nem akaszthatja meg, a snapshot D1-ből pótolható
		}
	}

	if (!draft) {
		fireNotify(
			event,
			notifyClassroom(db, {
				classroomId,
				excludeUserId: user.id,
				title: 'Élő dolgozat indult',
				body: title,
				url: `/elo/${id}`,
				tag: `live-${id}`,
				kind: 'task'
			})
		);
	}
	return json({ id }, { status: 201 });
};

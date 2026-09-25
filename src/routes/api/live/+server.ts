import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, newId, requireUser } from '$lib/server/db';
import { makeLiveCode } from '$lib/server/live';

// POST /api/live — élő dolgozat létrehozása (tanár): saját kvízből, saját osztályba.
// Létrehoz egy (határidő nélküli) dolgozat-kiírást is, hogy az eredmények a szokott
// helyen látszódjanak. A menet maga lusta: az első csatlakozásig semmi sem fut.
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const superadmin = (user.is_admin ?? 0) === 1;
	if (user.role !== 'teacher' && !superadmin) {
		return json({ error: 'Tanári funkció.' }, { status: 403 });
	}
	let body: {
		classroom_id?: unknown; assessment_id?: unknown; qmode?: unknown; pacing?: unknown;
		per_q_secs?: unknown; total_mins?: unknown; count?: unknown;
	};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const classroom_id = String(body.classroom_id ?? '');
	const assessment_id = String(body.assessment_id ?? '');
	if (!classroom_id) return json({ error: 'Válassz osztályt.' }, { status: 400 });
	if (!assessment_id) return json({ error: 'Válassz kvízt.' }, { status: 400 });
	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(classroom_id)
		.first<{ id: string; teacher_id: string }>();
	if (!room || (room.teacher_id !== user.id && !superadmin)) {
		return json({ error: 'Nem a te osztályod.' }, { status: 403 });
	}
	const asm = superadmin
		? await db
				.prepare(`SELECT id, title FROM assessments WHERE id = ?`)
				.bind(assessment_id)
				.first<{ id: string; title: string }>()
		: await db
				.prepare(`SELECT id, title FROM assessments WHERE id = ? AND teacher_id = ?`)
				.bind(assessment_id, user.id)
				.first<{ id: string; title: string }>();
	if (!asm) return json({ error: 'Nincs ilyen kvízed.' }, { status: 404 });

	const qmode = body.qmode === 'different' ? 'different' : 'same';
	const pacing = body.pacing === 'self' ? 'self' : 'global';
	const per_q_secs = Math.max(5, Math.min(300, Number(body.per_q_secs ?? 30) || 30));
	const total_mins = Math.max(0, Math.min(180, Number(body.total_mins ?? 0) || 0));
	if (pacing === 'self' && total_mins < 1) {
		return json({ error: 'Saját tempóhoz adj meg összidőt.' }, { status: 400 });
	}
	const count = Math.max(0, Math.min(50, Number(body.count ?? 0) || 0));

	const aid = newId();
	await db
		.prepare(
			`INSERT INTO assignments (id, assessment_id, classroom_id, start_date, due_date,
				max_attempts, time_limit_mins, shuffle, feedback_delayed, is_exam, min_score)
			 VALUES (?, ?, ?, ?, 0, 0, 0, 1, 0, 1, 0)`
		)
		.bind(aid, asm.id, classroom_id, Date.now())
		.run();

	let code = '';
	for (let i = 0; i < 10 && !code; i++) {
		const c = makeLiveCode();
		const ex = await db.prepare(`SELECT 1 AS x FROM live_sessions WHERE code = ?`).bind(c).first();
		if (!ex) code = c;
	}
	if (!code) return json({ error: 'Próbáld újra.' }, { status: 500 });
	const id = newId();
	await db
		.prepare(
			`INSERT INTO live_sessions (id, code, assignment_id, classroom_id, teacher_id, status,
				qmode, pacing, per_q_secs, total_mins, count, created_at)
			 VALUES (?, ?, ?, ?, ?, 'lobby', ?, ?, ?, ?, ?, ?)`
		)
		.bind(id, code, aid, classroom_id, user.id, qmode, pacing, per_q_secs, total_mins, count, Date.now())
		.run();
	return json({ session: { id, code, assignment_id: aid } }, { status: 201 });
};

// GET /api/live?classroom_id= — az osztály aktív (váró/élő) menetei.
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroom_id = event.url.searchParams.get('classroom_id') ?? '';
	if (!classroom_id) return json({ error: 'Hiányzó osztály.' }, { status: 400 });
	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(classroom_id)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	const mine = room.teacher_id === user.id;
	const superadmin = (user.is_admin ?? 0) === 1;
	if (!mine && !superadmin) {
		const m = await db
			.prepare(`SELECT 1 AS x FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
			.bind(classroom_id, user.id)
			.first();
		if (!m) return json({ error: 'Nem vagy tagja ennek az osztálynak.' }, { status: 403 });
	}
	const rows = await db
		.prepare(
			`SELECT s.id, s.code, s.status, s.qmode, s.pacing, s.created_at, a.title,
				(SELECT COUNT(*) FROM live_participants p WHERE p.session_id = s.id) AS joined
			 FROM live_sessions s
			 JOIN assignments asm ON asm.id = s.assignment_id
			 JOIN assessments a ON a.id = asm.assessment_id
			 WHERE s.classroom_id = ? AND s.status IN ('lobby', 'live')
			 ORDER BY s.created_at DESC`
		)
		.bind(classroom_id)
		.all();
	return json({ sessions: rows.results ?? [] });
};

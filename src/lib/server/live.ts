// Élő dolgozat szerver-logika: D1-alapú, időbélyeg-vezérelt (lusta átmenetek).
// Nincs idle-költség: kérés nélkül semmi sem fut — az első csatlakozás "indítja".
import type { D1Database } from '@cloudflare/workers-types';
import { newId, shuffle } from './db';
import { expandQuizQs, type QuizQ, type QuizRow } from './study';

export interface LiveSession {
	id: string;
	code: string;
	assignment_id: string;
	classroom_id: string | null;
	teacher_id: string;
	status: 'lobby' | 'live' | 'finished';
	qmode: 'same' | 'different';
	pacing: 'global' | 'self';
	per_q_secs: number;
	total_mins: number;
	count: number;
	total_q: number;
	current_idx: number;
	deadline_ts: number;
	ends_at: number;
	started_at: number;
	finished_at: number;
	created_at: number;
}

export interface LiveItem {
	idx: number;
	question_text: string;
	type: string;
	options: string[];
	left: string | null;
}

/** 6 jegyű csatlakozókód (első számjegy nem nulla). */
export function makeLiveCode(): string {
	const b = crypto.getRandomValues(new Uint8Array(6));
	let s = String(1 + (b[0] % 9));
	for (let i = 1; i < 6; i++) s += String(b[i] % 10);
	return s;
}

export async function getLiveByCode(
	db: D1Database,
	code: string
): Promise<LiveSession | null> {
	const r = await db
		.prepare(`SELECT * FROM live_sessions WHERE code = ?`)
		.bind(String(code ?? '').trim())
		.first<LiveSession>();
	return r ?? null;
}

/** Hozzáférés: 'teacher' (tulajdonos), 'member' (osztálytag) vagy null. */
export async function canAccessLive(
	db: D1Database,
	s: LiveSession,
	userId: string
): Promise<'teacher' | 'member' | null> {
	if (s.teacher_id === userId) return 'teacher';
	if (!s.classroom_id) return 'member';
	const m = await db
		.prepare(`SELECT 1 AS x FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
		.bind(s.classroom_id, userId)
		.first();
	return m ? 'member' : null;
}

export async function isLiveParticipant(
	db: D1Database,
	sessionId: string,
	userId: string
): Promise<boolean> {
	const r = await db
		.prepare(`SELECT 1 AS x FROM live_participants WHERE session_id = ? AND user_id = ?`)
		.bind(sessionId, userId)
		.first();
	return !!r;
}

async function loadPool(db: D1Database, assessmentId: string): Promise<QuizQ[]> {
	const rows = await db
		.prepare(
			`SELECT id, question_text, type, options_json, correct_answer FROM assessment_items
			 WHERE assessment_id = ? ORDER BY order_index`
		)
		.bind(assessmentId)
		.all<QuizRow>();
	return expandQuizQs(rows.results ?? []);
}

/** Kérdéssor kiosztása egy résztvevőnek (idempotens). */
export async function dealItems(db: D1Database, s: LiveSession, userId: string): Promise<number> {
	const ex = await db
		.prepare(`SELECT 1 AS x FROM live_items WHERE session_id = ? AND user_id = ? LIMIT 1`)
		.bind(s.id, userId)
		.first();
	if (ex) {
		const c = await db
			.prepare(`SELECT COUNT(*) AS n FROM live_items WHERE session_id = ? AND user_id = ?`)
			.bind(s.id, userId)
			.first<{ n: number }>();
		return c?.n ?? 0;
	}
	const pool = await (async () => {
		const a = await db
			.prepare(`SELECT assessment_id FROM assignments WHERE id = ?`)
			.bind(s.assignment_id)
			.first<{ assessment_id: string }>();
		if (!a) return [];
		return loadPool(db, a.assessment_id);
	})();
	let picked = pool;
	const n = s.count > 0 ? Math.min(s.count, pool.length) : pool.length;
	if (s.qmode === 'different') picked = shuffle(pool).slice(0, n);
	else picked = pool.slice(0, n);
	let i = 0;
	for (const q of picked) {
		const opts = q.options.length > 1 ? shuffle(q.options) : q.options;
		await db
			.prepare(
				`INSERT OR IGNORE INTO live_items (id, session_id, user_id, idx, question_text, type, options_json, correct_answer, left_text)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				`${s.id}:${userId}:${i}`, s.id, userId, i,
				q.question_text, q.type, JSON.stringify(opts), q.correct_answer, q.left ?? null
			)
			.run();
		i++;
	}
	return i;
}

async function freshSession(db: D1Database, id: string): Promise<LiveSession | null> {
	return (await db.prepare(`SELECT * FROM live_sessions WHERE id = ?`).bind(id).first<LiveSession>()) ?? null;
}

/** Egy résztvevő lezárása: pontszám + submission-írás (idempotens). */
export async function finishStudent(db: D1Database, s: LiveSession, userId: string): Promise<{ score: number; total: number }> {
	const items = await db
		.prepare(`SELECT COUNT(*) AS n FROM live_items WHERE session_id = ? AND user_id = ?`)
		.bind(s.id, userId)
		.first<{ n: number }>();
	const total = items?.n ?? 0;
	const sc = await db
		.prepare(`SELECT COUNT(*) AS n FROM live_answers WHERE session_id = ? AND user_id = ? AND correct = 1`)
		.bind(s.id, userId)
		.first<{ n: number }>();
	const score = sc?.n ?? 0;
	const already = await db
		.prepare(`SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ? AND submitted_at > 0 LIMIT 1`)
		.bind(s.assignment_id, userId)
		.first();
	if (!already && total > 0) {
		await db
			.prepare(
				`INSERT INTO submissions (id, assignment_id, student_id, score, total, started_at, submitted_at, answers_json)
				 VALUES (?, ?, ?, ?, ?, ?, ?, '{}')`
			)
			.bind(newId(), s.assignment_id, userId, score, total, s.started_at || Date.now(), Date.now())
			.run();
	}
	await db
		.prepare(`UPDATE live_participants SET finished_at = ?, score = ? WHERE session_id = ? AND user_id = ? AND finished_at = 0`)
		.bind(Date.now(), score, s.id, userId)
		.run();
	return { score, total };
}

/** Teljes menet lezárása (idempotens). */
export async function finishSession(db: D1Database, s: LiveSession): Promise<LiveSession> {
	if (s.status === 'finished') return s;
	const parts = await db
		.prepare(`SELECT user_id FROM live_participants WHERE session_id = ?`)
		.bind(s.id)
		.all<{ user_id: string }>();
	for (const p of parts.results ?? []) {
		await finishStudent(db, s, p.user_id);
	}
	await db
		.prepare(`UPDATE live_sessions SET status = 'finished', finished_at = ? WHERE id = ?`)
		.bind(Date.now(), s.id)
		.run();
	return (await freshSession(db, s.id)) ?? { ...s, status: 'finished' as const };
}

/** Egyet léptet (tanári "Tovább" vagy lejárt idő). */
export async function advanceOnce(db: D1Database, s: LiveSession): Promise<LiveSession> {
	if (s.status !== 'live' || s.pacing !== 'global') return s;
	const next = s.current_idx + 1;
	if (next >= s.total_q) return finishSession(db, s);
	await db
		.prepare(`UPDATE live_sessions SET current_idx = ?, deadline_ts = ? WHERE id = ?`)
		.bind(next, Date.now() + s.per_q_secs * 1000, s.id)
		.run();
	return (await freshSession(db, s.id)) ?? s;
}

/** Lusta átmenet olvasáskor: lejárt kérdéshatár → léptetés (akár a végéig).
 *  Saját tempónál a lejárt összidő a teljes menetet zárja (különben örökké live maradna). */
export async function transition(db: D1Database, s: LiveSession): Promise<LiveSession> {
	if (s.status !== 'live') return s;
	if (s.pacing === 'self') {
		if (s.ends_at > 0 && Date.now() > s.ends_at) {
			return finishSession(db, s);
		}
		return s;
	}
	let cur = s;
	let guard = 0;
	while (cur.status === 'live' && cur.deadline_ts > 0 && Date.now() > cur.deadline_ts && guard++ < 200) {
		cur = await advanceOnce(db, cur);
	}
	return cur;
}

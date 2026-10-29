import type { D1Database, DurableObjectNamespace, DurableObjectState } from '@cloudflare/workers-types';
import { loadQuestionOptions } from '../question-types/registry';
import type { QuizPair } from '../curriculum';

/* Élő dolgozat: kérdések összeállítása leckékből és csomagokból.
   Kártya (front/back) szöveges beírós kérdéssé alakul. */

export interface LiveConfig {
	lessonIds: string[];
	deckIds?: string[];
	orderMode: 'same' | 'shuffled';
	count: number;
	pacing: 'self' | 'synced';
	playMode: 'solo' | 'stage';
}

export interface LiveQuestion {
	id: string;
	question_text: string;
	type: string;
	options: string[];
	pairs: QuizPair[];
	correct_answer: string;
	settings?: Record<string, unknown>;
}

export interface LiveFeasibility {
	ok: boolean;
	total: number;
	requested: number;
	effective: number;
	message: string;
}

/** Önhelyreállító séma az élő dolgozathoz (migráció nélkül is működik). */
export async function ensureLiveSchema(db: D1Database): Promise<void> {
	await db.batch([
		db.prepare(
			`CREATE TABLE IF NOT EXISTS live_sessions (
				id TEXT PRIMARY KEY,
				classroom_id TEXT NOT NULL,
				teacher_id TEXT NOT NULL,
				title TEXT NOT NULL DEFAULT '',
				config_json TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'lobby',
				created_at INTEGER,
				started_at INTEGER,
				finished_at INTEGER
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS live_results (
				session_id TEXT NOT NULL,
				user_id TEXT NOT NULL,
				display_name TEXT NOT NULL DEFAULT '',
				score INTEGER NOT NULL DEFAULT 0,
				total INTEGER NOT NULL DEFAULT 0,
				finished_at INTEGER,
				PRIMARY KEY (session_id, user_id)
			)`
		),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_live_sessions_class ON live_sessions(classroom_id, status)`)
	]);
}

function cleanIds(raw: unknown, limit: number): string[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const item of raw) {
		const id = String(item ?? '').trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		out.push(id);
		if (out.length >= limit) break;
	}
	return out;
}

interface QuizQuestionRow {
	id: string;
	question_text: string;
	type: string;
	options_json: string;
	correct_answer: string;
}

interface CardRow {
	id: string;
	front: string;
	back: string;
}

function toQuizQuestion(row: QuizQuestionRow): LiveQuestion | null {
	const text = String(row.question_text ?? '').trim();
	if (!text) return null;
	let extra: { options?: string[]; pairs?: QuizPair[]; settings?: Record<string, unknown> } = {};
	try {
		extra = loadQuestionOptions(row.type ?? 'choice', row.options_json ?? '[]') as typeof extra;
	} catch {
		extra = {};
	}
	return {
		id: row.id,
		question_text: text,
		type: row.type ?? 'choice',
		options: Array.isArray(extra.options) ? extra.options.map(String) : [],
		pairs: Array.isArray(extra.pairs) ? extra.pairs : [],
		correct_answer: String(row.correct_answer ?? ''),
		...(extra.settings ? { settings: extra.settings } : {})
	};
}

/** Kártyasor szöveges kérdéssé alakítása. */
export function cardToLiveQuestion(row: CardRow): LiveQuestion | null {
	const front = String(row.front ?? '').trim();
	const back = String(row.back ?? '').trim();
	if (!front || !back) return null;
	return {
		id: `card-${row.id}`,
		question_text: front,
		type: 'text',
		options: [],
		pairs: [],
		correct_answer: back
	};
}

/* Lecke kvízkérdések + leckekártyák + csomagkártyák (front/back) lekérése.
   deckIds közvetlenül csomagazonosítók (deck_cards.deck_id). */
export async function buildLiveQuestions(
	db: D1Database,
	lessonIds: string[],
	deckIds?: string[]
): Promise<LiveQuestion[]> {
	const lessons = cleanIds(lessonIds, 20);
	const decks = cleanIds(deckIds ?? [], 20);
	const out: LiveQuestion[] = [];
	const seen = new Set<string>();
	const push = (q: LiveQuestion | null) => {
		if (!q || seen.has(q.id)) return;
		seen.add(q.id);
		out.push(q);
	};
	if (lessons.length > 0) {
		const ph = lessons.map(() => '?').join(',');
		try {
			const quizRes = await db
				.prepare(`SELECT id FROM quizzes WHERE lesson_id IN (${ph})`)
				.bind(...lessons)
				.all<{ id: string }>();
			const quizIds = (quizRes.results ?? []).map((q) => q.id).filter(Boolean);
			if (quizIds.length > 0) {
				const qph = quizIds.map(() => '?').join(',');
				const qRes = await db
					.prepare(
						`SELECT id, question_text, COALESCE(type, 'choice') AS type,
							COALESCE(options_json, '[]') AS options_json,
							COALESCE(correct_answer, '') AS correct_answer
						 FROM quiz_questions WHERE quiz_id IN (${qph}) ORDER BY sort, id`
					)
					.bind(...quizIds)
					.all<QuizQuestionRow>();
				for (const row of qRes.results ?? []) push(toQuizQuestion(row));
			}
		} catch {
			// kvíz nélkül is mehet tovább kártyákkal
		}
		try {
			const cardRes = await db
				.prepare(
					`SELECT id, COALESCE(front, '') AS front, COALESCE(back, '') AS back
					 FROM lesson_cards WHERE lesson_id IN (${ph}) ORDER BY sort, id`
				)
				.bind(...lessons)
				.all<CardRow>();
			for (const row of cardRes.results ?? []) push(cardToLiveQuestion(row));
		} catch {
			// kártya nélkül is jó
		}
	}
	if (decks.length > 0) {
		try {
			const dph = decks.map(() => '?').join(',');
			const deckRes = await db
				.prepare(
					`SELECT id, COALESCE(front, '') AS front, COALESCE(back, '') AS back
					 FROM deck_cards WHERE deck_id IN (${dph}) ORDER BY sort, id`
				)
				.bind(...decks)
				.all<CardRow>();
			for (const row of deckRes.results ?? []) push(cardToLiveQuestion(row));
		} catch {
			// csomag nélkül is jó
		}
	}
	return out;
}

/** Kérdésdarab és kért darabszám összevetése. */
export function feasibility(total: number, count: number): LiveFeasibility {
	const t = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
	const requested = Number.isFinite(count) ? Math.floor(count) : 0;
	if (t <= 0) {
		return { ok: false, total: t, requested, effective: 0, message: 'Nincs kérdés a választott tananyagban.' };
	}
	if (requested < 1) {
		return { ok: false, total: t, requested, effective: 0, message: 'A kérdésszám legalább 1 legyen.' };
	}
	const effective = Math.min(requested, t);
	return {
		ok: true,
		total: t,
		requested,
		effective,
		message: requested > t ? 'Kevesebb kérdés van, mint kértél, mindet betesszük.' : ''
	};
}

/** Tantermi szerep: tanár (tulajdonos) vagy tag. */
export async function getClassRole(
	db: D1Database,
	classroomId: string,
	userId: string
): Promise<{ exists: boolean; isTeacher: boolean; isMember: boolean }> {
	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(classroomId)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return { exists: false, isTeacher: false, isMember: false };
	if (room.teacher_id === userId) return { exists: true, isTeacher: true, isMember: true };
	const member = await db
		.prepare(`SELECT user_id FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
		.bind(classroomId, userId)
		.first<{ user_id: string }>();
	return { exists: true, isTeacher: false, isMember: !!member };
}

/* DO híváshoz típusbiztos stub: a DOM Request és a worker Request ütközését áthidalja. */
export async function callLiveRoom(
	ns: DurableObjectNamespace,
	sessionId: string,
	body: Record<string, unknown>
): Promise<{ status: number; data: Record<string, unknown> }> {
	const stub = ns.get(ns.idFromName(sessionId)) as unknown as {
		fetch: (req: Request) => Promise<Response>;
	};
	const res = await stub.fetch(
		new Request('https://internal/event', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	);
	let data: Record<string, unknown> = {};
	try {
		data = (await res.json()) as Record<string, unknown>;
	} catch {
		data = {};
	}
	return { status: res.status, data };
}

/* DO pillanatkép lekérése adott nézőhöz. */
export async function fetchLiveSnapshot(
	ns: DurableObjectNamespace,
	sessionId: string,
	userId: string,
	role: string
): Promise<Record<string, unknown> | null> {
	try {
		const stub = ns.get(ns.idFromName(sessionId)) as unknown as {
			fetch: (req: Request) => Promise<Response>;
		};
		const res = await stub.fetch(
			new Request(
				`https://internal/snapshot?userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`
			)
		);
		if (!res.ok) return null;
		return (await res.json()) as Record<string, unknown>;
	} catch {
		return null;
	}
}

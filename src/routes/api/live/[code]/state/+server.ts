import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { dealItems, getLiveByCode, isLiveParticipant, transition } from '$lib/server/live';

// GET /api/live/[code]/state — pillanatkép tanárnak és diáknak (2 mp-es pollinghoz).
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let s = await getLiveByCode(db, event.params.code ?? '');
	if (!s) return json({ error: 'Nincs ilyen kódú élő dolgozat.' }, { status: 404 });

	const isTeacher = s.teacher_id === user.id || (user.is_admin ?? 0) === 1;
	if (isTeacher) {
		s = await transition(db, s);
		const parts = await db
			.prepare(
				`SELECT p.user_id AS id, p.name, p.joined_at, p.finished_at, p.score,
					(SELECT COUNT(*) FROM live_answers a WHERE a.session_id = p.session_id AND a.user_id = p.user_id) AS answered,
					(SELECT COUNT(*) FROM live_answers a WHERE a.session_id = p.session_id AND a.user_id = p.user_id AND a.correct = 1) AS live_score,
					(SELECT COUNT(*) FROM live_items i WHERE i.session_id = p.session_id AND i.user_id = p.user_id) AS total
				 FROM live_participants p WHERE p.session_id = ? ORDER BY p.joined_at`
			)
			.bind(s.id)
			.all();
		let sample: {
			idx: number; question_text: string; type: string;
			options: string[]; left: string | null; correct_answer: string;
		} | null = null;
		// Minta csak akkor értelmes, ha mindenki ugyanazt a sort kapja (qmode same + global).
		// "Mindenki mást" módban minden diáknál más kérdés van ugyanazon az idx-en — ott nincs minta.
		if (s.status === 'live' && s.pacing === 'global' && s.qmode === 'same') {
			const first = (parts.results ?? [])[0] as { id: string } | undefined;
			if (first) {
				const it = await db
					.prepare(
						`SELECT idx, question_text, type, options_json, correct_answer, left_text
						 FROM live_items WHERE session_id = ? AND user_id = ? AND idx = ?`
					)
					.bind(s.id, first.id, s.current_idx)
					.first<{
						idx: number; question_text: string; type: string;
						options_json: string; correct_answer: string; left_text: string | null;
					}>();
				if (it) {
					let options: string[] = [];
					try {
						const p: unknown = JSON.parse(it.options_json);
						if (Array.isArray(p)) options = p.map(String);
					} catch {
						// üres
					}
					sample = {
						idx: it.idx,
						question_text: it.question_text,
						type: it.type,
						options,
						left: it.left_text,
						correct_answer: it.correct_answer
					};
				}
			}
		}
		const title = await db
			.prepare(
				`SELECT a.title FROM live_sessions s
				 JOIN assignments asm ON asm.id = s.assignment_id
				 JOIN assessments a ON a.id = asm.assessment_id
				 WHERE s.id = ?`
			)
			.bind(s.id)
			.first<{ title: string }>();
		return json({
			role: 'teacher',
			status: s.status,
			assignment_id: s.assignment_id,
			classroom_id: s.classroom_id,
			title: title?.title ?? 'Élő dolgozat',
			settings: {
				qmode: s.qmode, pacing: s.pacing, per_q_secs: s.per_q_secs,
				total_mins: s.total_mins, count: s.count, total_q: s.total_q,
				current_idx: s.current_idx, deadline_ts: s.deadline_ts, ends_at: s.ends_at,
				started_at: s.started_at
			},
			participants: parts.results ?? [],
			answered_now:
				s.status === 'live' && s.pacing === 'global'
					? (
							await db
								.prepare(`SELECT COUNT(*) AS n FROM live_answers WHERE session_id = ? AND idx = ?`)
								.bind(s.id, s.current_idx)
								.first<{ n: number }>()
						)?.n ?? 0
					: 0,
			sample
		});
	}

	// Diák: ha még nincs bent, csak az állapot — a falról jön, külön kód nem kell.
	// classroom_id-t is adjuk, hogy a vissza-gomb az osztályfalra vigyen.
	if (!(await isLiveParticipant(db, s.id, user.id))) {
		const jc =
			s.status === 'lobby'
				? await db
						.prepare(`SELECT COUNT(*) AS n FROM live_participants WHERE session_id = ?`)
						.bind(s.id)
						.first<{ n: number }>()
				: null;
		const tt = await db
			.prepare(
				`SELECT a.title FROM live_sessions s
				 JOIN assignments asm ON asm.id = s.assignment_id
				 JOIN assessments a ON a.id = asm.assessment_id
				 WHERE s.id = ?`
			)
			.bind(s.id)
			.first<{ title: string }>();
		return json({
			role: 'student',
			status: s.status,
			joined: false,
			joined_n: jc?.n ?? 0,
			title: tt?.title ?? 'Élő dolgozat',
			classroom_id: s.classroom_id
		});
	}
	s = await transition(db, s);
	// Biztonsági osztás: ha élőben vagyunk, de neki nincs sora (versenyhelyzet).
	if (s.status === 'live') {
		await dealItems(db, s, user.id);
	}
	const itemRows = await db
		.prepare(
			`SELECT idx, question_text, type, options_json, left_text
			 FROM live_items WHERE session_id = ? AND user_id = ? ORDER BY idx`
		)
		.bind(s.id, user.id)
		.all<{ idx: number; question_text: string; type: string; options_json: string; left_text: string | null }>();
	const items = (itemRows.results ?? []).map((r) => {
		let options: string[] = [];
		try {
			const p: unknown = JSON.parse(r.options_json);
			if (Array.isArray(p)) options = p.map(String);
		} catch {
			// üres
		}
		return { idx: r.idx, question_text: r.question_text, type: r.type, options, left: r.left_text };
	});
	const ansRows = await db
		.prepare(`SELECT idx, answer FROM live_answers WHERE session_id = ? AND user_id = ?`)
		.bind(s.id, user.id)
		.all<{ idx: number; answer: string }>();
	const answers: Record<number, string> = {};
	for (const a of ansRows.results ?? []) answers[a.idx] = a.answer;
	const me = await db
		.prepare(`SELECT finished_at, score FROM live_participants WHERE session_id = ? AND user_id = ?`)
		.bind(s.id, user.id)
		.first<{ finished_at: number; score: number }>();
	const jc = await db
		.prepare(`SELECT COUNT(*) AS n FROM live_participants WHERE session_id = ?`)
		.bind(s.id)
		.first<{ n: number }>();
	const finished = (me?.finished_at ?? 0) > 0 || s.status === 'finished';
	let review: {
		idx: number; question_text: string; type: string; options: string[];
		left: string | null; correct_answer: string; answer: string; correct: boolean;
	}[] | null = null;
	let score = me?.score ?? 0;
	let total = items.length;
	if (finished) {
		const rev = await db
			.prepare(
				`SELECT i.idx, i.question_text, i.type, i.options_json, i.left_text, i.correct_answer,
					COALESCE(a.answer, '') AS answer, COALESCE(a.correct, 0) AS correct
				 FROM live_items i LEFT JOIN live_answers a ON a.item_id = i.id
				 WHERE i.session_id = ? AND i.user_id = ? ORDER BY i.idx`
			)
			.bind(s.id, user.id)
			.all<{
				idx: number; question_text: string; type: string; options_json: string;
				left_text: string | null; correct_answer: string; answer: string; correct: number;
			}>();
		review = (rev.results ?? []).map((r) => {
			let options: string[] = [];
			try {
				const p: unknown = JSON.parse(r.options_json);
				if (Array.isArray(p)) options = p.map(String);
			} catch {
				// üres
			}
			return {
				idx: r.idx, question_text: r.question_text, type: r.type, options,
				left: r.left_text, correct_answer: r.correct_answer,
				answer: r.answer, correct: r.correct === 1
			};
		});
		score = review.filter((x) => x.correct).length;
	}
	return json({
		role: 'student',
		status: s.status,
		joined: true,
		joined_n: jc?.n ?? 0,
		title: undefined,
		classroom_id: s.classroom_id,
		settings: {
			qmode: s.qmode, pacing: s.pacing, per_q_secs: s.per_q_secs,
			total_mins: s.total_mins, total_q: s.total_q,
			current_idx: s.current_idx, deadline_ts: s.deadline_ts, ends_at: s.ends_at
		},
		items,
		answers,
		finished,
		score,
		total,
		review
	});
};

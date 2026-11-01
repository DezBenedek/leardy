import type { QuizQuestion } from '$lib/curriculum/curriculum';
import type { LivePayload, LiveParticipant, LiveStatus, LiveStudentDetail } from './live-types';

/* Kérdéslista stabilitása: a 2,5 mp-es polling és a socket-üzenetek
   minden körben új tömböt hoznának, amitől a diákoldali játék
   állapota (gépelés, sorrend, keverés) időnként újragenerálódna.
   Ha a tartalom bájtpontosan egyezik, a régi referenciát adjuk vissza,
   így semmi nem mozdul véletlenül. */
export function createQuestionStabilizer() {
	let lastQuestions: QuizQuestion[] = [];
	return function stableQuestions(list: QuizQuestion[]): QuizQuestion[] {
		if (
			list.length === lastQuestions.length &&
			list.every((q, i) => {
				const p = lastQuestions[i];
				return p && q.id === p.id && q.question_text === p.question_text &&
					JSON.stringify(q.options ?? []) === JSON.stringify(p.options ?? []) &&
					JSON.stringify(q.pairs ?? []) === JSON.stringify(p.pairs ?? []) &&
					(q.type ?? '') === (p.type ?? '');
			})
		) {
			return lastQuestions;
		}
		lastQuestions = list;
		return list;
	};
}

/* Nyers szoba (D1 session + DO snapshot vagy lapos DO üzenet) egységes nézetté alakítása. */
export function mapRoom(
	room: Record<string, unknown>,
	uid: string,
	stableQuestions: (list: QuizQuestion[]) => QuizQuestion[]
): LivePayload {
	const raw = room && typeof room === 'object' ? room : {};
	const hasSession = raw.session && typeof raw.session === 'object';
	const session = (hasSession ? raw.session : {}) as Record<string, unknown>;
	const snapRaw = raw.live && typeof raw.live === 'object' ? raw.live : hasSession ? {} : raw;
	const snap = (snapRaw && typeof snapRaw === 'object' ? snapRaw : {}) as Record<string, unknown>;
	const status = (snap.status === 'live' || snap.status === 'done' ? snap.status : session.status === 'live' || session.status === 'done' ? session.status : 'lobby') as LiveStatus;
	const questions = (Array.isArray(snap.questions) ? snap.questions : []) as QuizQuestion[];
	const total = typeof snap.total === 'number' && snap.total > 0 ? snap.total : questions.length;
	const teacherId = typeof session.teacher_id === 'string' ? session.teacher_id : '';
	const isTeacher = teacherId ? teacherId === uid : snap.isTeacher === true;
	const parts = (Array.isArray(snap.participants) ? snap.participants : []) as Record<string, unknown>[];
	const scores = (Array.isArray(snap.scores) ? snap.scores : []) as Record<string, unknown>[];
	const scoreBy = new Map(scores.map((s) => [String(s.userId ?? ''), s]));
	const participants: LiveParticipant[] = parts.map((p) => {
		const id = String(p.id ?? '');
		const s = scoreBy.get(id);
		const answered = typeof s?.answered === 'number' ? s.answered : 0;
		const correct = typeof s?.score === 'number' ? s.score : 0;
		return { id, name: String(p.name ?? 'Diák'), answered, total, correct, score: correct };
	});
	const my = (snap.myAnswers && typeof snap.myAnswers === 'object' ? snap.myAnswers : {}) as Record<string, { ok?: boolean }>;
	const myKeys = Object.keys(my);
	const myScore = (() => {
		const own = scoreBy.get(uid);
		if (own && typeof own.score === 'number') return own.score;
		return myKeys.filter((k) => my[k]?.ok).length;
	})();
	const ranking = (scores.length > 0 ? scores : parts).map((r) => ({
		name: String((r as Record<string, unknown>).name ?? 'Diák'),
		score: Number((r as Record<string, unknown>).score ?? 0) || 0,
		userId: String((r as Record<string, unknown>).userId ?? (r as Record<string, unknown>).id ?? '')
	}));
	return {
		status,
		isDraft: String(session.status ?? '') === 'draft',
		title: String(session.title ?? snap.title ?? 'Élő dolgozat'),
		classroomId: String(session.classroom_id ?? snap.classroomId ?? ''),
		isTeacher,
		playMode: snap.playMode === 'stage' ? 'stage' : 'solo',
		pacing: snap.pacing === 'synced' ? 'synced' : 'self',
		questions: stableQuestions(questions),
		index: typeof snap.currentIndex === 'number' ? snap.currentIndex : typeof snap.index === 'number' ? snap.index : 0,
		locked: status !== 'live',
		participants,
		joined: participants.some((p) => p.id === uid),
		myScore,
		myTotal: total,
		ranking,
		dist: (snap.dist && typeof snap.dist === 'object' ? snap.dist : {}) as Record<string, Record<string, number>>,
		details: (Array.isArray(snap.details) ? snap.details : []) as LiveStudentDetail[]
	};
}

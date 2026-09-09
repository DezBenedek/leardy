// Megosztott típusok + API kliens + apró helperek a Topic->Lesson rendszerhez.
import { enqueueOutbox, QueuedOffline } from './outbox.svelte';

export { QueuedOffline };

export type TopicType = 'language' | 'general';
export type ReviewFilter = 'mind' | 'language' | 'general';

/** Tantárgy-kategóriák. A nyelvi hármasnál a felület audiót + kiejtésellenőrzést ad. */
export const CATEGORIES = ['Angol', 'Német', 'Olasz', 'Matek', 'Irodalom', 'Nyelvtan', 'Történelem'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface PracticeSource {
	id: string;
	title: string;
	type: TopicType;
	lessons: { id: string; title: string; due: number; total: number }[];
}

export interface AssessmentRow {
	id: string;
	title: string;
	topic_id: string | null;
	topic_title: string | null;
	max_attempts: number;
	time_limit_mins: number;
	shuffle: number;
	feedback_delayed: number;
	is_exam: number;
	created_at: number;
	items: number;
	assigned: number;
}

export interface AssessmentItem {
	id: string;
	question_text: string;
	type: string;
	options_json: string;
	correct_answer: string;
}

export interface MyCard {
	id: string;
	front_text: string;
	back_text: string;
	ipa: string | null;
	example: string | null;
	lesson_id: string;
	lesson_title: string;
	topic_id: string;
	topic_title: string;
}

export interface MyLesson {
	id: string;
	title: string;
	topic_id: string;
	topic_title: string;
	cards: number;
}

export interface MyTopic {
	id: string;
	title: string;
	category: string;
	type: TopicType;
	is_public: number;
	lessons: number;
}

export interface MessageRow {
	id: string;
	title: string;
	body: string;
	link_url: string | null;
	ref_type: 'topic' | 'lesson' | 'deck' | 'assessment' | string | null;
	ref_id: string | null;
	ref_link: string | null;
	ref_title: string | null;
	created_at: number;
	teacher_name: string;
}

export type AttachmentKind = 'link' | 'lesson' | 'topic' | 'deck' | 'quiz';

export const ATTACH_LABEL: Record<AttachmentKind, string> = {
	link: 'Link',
	lesson: 'Lecke',
	topic: 'Témakör',
	deck: 'Kártya',
	quiz: 'Kvíz'
};

export interface Topic {
	id: string;
	title: string;
	category: string;
	type: TopicType;
	is_public: number;
	enrolled?: number;
	lessons?: number;
	cards?: number;
}

export interface LessonRow {
	id: string;
	topic_id: string;
	order_index: number;
	title: string;
	theory_done?: number;
	cards_done?: number;
	quiz_done?: number;
	quiz_best?: number;
}

export interface Card {
	id: string;
	lesson_id: string;
	front_text: string;
	back_text: string;
	audio_url: string | null;
	image_url: string | null;
	ipa: string | null;
	example: string | null;
}

export interface QuizQ {
	id: string;
	question_text: string;
	type: string;
	options: string[];
	/** match-típusnál a bal oldal (pl. évszám) */
	left?: string;
	correct_answer: string;
	/** Nyers options_json a szerkesztőnek (sorrend/párosítás kanonikus adata). */
	options_raw?: string;
	/** Melyik leckéből jön (témazáró statisztikához). */
	lesson_id?: string;
}

export interface ExamLast {
	score: number;
	total: number;
	created_at: number;
	mistakes: { lesson_id: string; title: string; wrong: number; total: number }[];
}

export interface LessonDetail {
	lesson: { id: string; topic_id: string; title: string; description_markdown: string };
	topic: { id: string; title: string; type: TopicType; category: string };
	cards: Card[];
	quiz: QuizQ[];
	progress: { theory_done: number; cards_done: number; quiz_done: number; quiz_best: number };
}

export interface ReviewCard extends Card {
	topic_id: string;
	topic_title: string;
	topic_type: TopicType;
	ease_interval: number;
	status: string;
}

export interface DayActivity {
	day: string;
	xp: number;
	reviews: number;
}

export interface Stats {
	xp: number;
	streak: number;
	role: string;
	week: DayActivity[];
	due: { mind: number; language: number; general: number };
	lessonsDone: number;
	lastLesson: { id: string; title: string; topic_title: string } | null;
}

export interface Classroom {
	id: string;
	name: string;
	code: string;
	subject?: string;
	mine?: number;
	members?: number;
}

export interface AssignmentRow {
	id: string;
	title: string;
	classroom_name: string;
	start_date: number;
	due_date: number;
	time_limit_mins: number;
	max_attempts: number;
	is_exam: number;
	feedback_delayed: number;
	min_score: number;
	attempts: number;
	submitted: number;
	best: number | null;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
	const method = (init?.method ?? 'GET').toUpperCase();
	let offline = false;
	try {
		offline = typeof navigator !== 'undefined' && !navigator.onLine;
	} catch {
		offline = false;
	}
	if (offline && method !== 'GET') {
		if (path.startsWith('/api/auth/') || path.endsWith('/start')) {
			throw new Error('Offline vagy — ez csak online megy.');
		}
		// Offline írás: sorba áll, visszakapcsolódáskor automatikusan beküldődik.
		let body: unknown;
		const raw = init?.body;
		if (typeof raw === 'string' && raw) {
			try {
				body = JSON.parse(raw);
			} catch {
				body = raw;
			}
		}
		enqueueOutbox(path, method, body);
		throw new QueuedOffline('Offline mentve — automatikusan beküldjük, ha újra online leszel.');
	}
	const res = await fetch(path, {
		headers: { 'content-type': 'application/json' },
		...init
	});
	const data = (await res.json().catch(() => ({}))) as T & { error?: string };
	if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Hiba történt.');
	return data as T;
}

export const studyApi = {
	topics: (q = '') => req<{ topics: Topic[] }>(`/api/topics${q}`),
	topic: (id: string) =>
		req<{ topic: Topic; lessons: LessonRow[]; enrolled: boolean; mine: boolean }>(
			`/api/topics/${encodeURIComponent(id)}`
		),
	updateTopic: (id: string, body: { title?: string; category?: string; is_public?: boolean }) =>
		req<{ ok: boolean }>(`/api/topics/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			body: JSON.stringify(body)
		}),
	deleteTopic: (id: string) =>
		req<{ ok: boolean }>(`/api/topics/${encodeURIComponent(id)}`, { method: 'DELETE' }),
	addLesson: (topicId: string, body: { title: string; description_markdown?: string }) =>
		req<{ lesson: { id: string; title: string } }>(`/api/topics/${encodeURIComponent(topicId)}/lessons`, {
			method: 'POST',
			body: JSON.stringify(body)
		}),
	updateLesson: (id: string, body: { title?: string; description_markdown?: string }) =>
		req<{ ok: boolean }>(`/api/lessons/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			body: JSON.stringify(body)
		}),
	deleteLesson: (id: string) =>
		req<{ ok: boolean }>(`/api/lessons/${encodeURIComponent(id)}`, { method: 'DELETE' }),
	addCard: (lessonId: string, body: { front_text: string; back_text: string; ipa?: string; example?: string; audio_url?: string }) =>
		req<{ card: { id: string } }>(`/api/lessons/${encodeURIComponent(lessonId)}/cards`, {
			method: 'POST',
			body: JSON.stringify(body)
		}),
	updateCard: (id: string, body: { front_text?: string; back_text?: string; ipa?: string; example?: string; audio_url?: string }) =>
		req<{ ok: boolean }>(`/api/cards/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			body: JSON.stringify(body)
		}),
	deleteCard: (id: string) =>
		req<{ ok: boolean }>(`/api/cards/${encodeURIComponent(id)}`, { method: 'DELETE' }),
	addQuestion: (
		lessonId: string,
		body: { question_text: string; type: string; options?: string[]; left?: string; correct_answer: string }
	) =>
		req<{ question: { id: string } }>(`/api/lessons/${encodeURIComponent(lessonId)}/questions`, {
			method: 'POST',
			body: JSON.stringify(body)
		}),
	updateQuestion: (
		id: string,
		body: { question_text?: string; type?: string; options?: string[]; left?: string; correct_answer?: string }
	) =>
		req<{ ok: boolean }>(`/api/questions/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			body: JSON.stringify(body)
		}),
	deleteQuestion: (id: string) =>
		req<{ ok: boolean }>(`/api/questions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
	createDeck: (body: { title: string; category: string }) =>
		req<{ topic_id: string; lesson_id: string }>(`/api/decks`, {
			method: 'POST',
			body: JSON.stringify(body)
		}),
	enroll: (id: string) =>
		req<{ ok: boolean }>(`/api/topics/${encodeURIComponent(id)}/enroll`, { method: 'POST' }),
	exam: (id: string) =>
		req<{ topic: { title: string; type: TopicType }; quiz: QuizQ[]; lessons: { id: string; title: string }[]; last: ExamLast | null }>(
			`/api/topics/${encodeURIComponent(id)}/exam`
		),
	submitExam: (id: string, body: { score: number; total: number; mistakes: Record<string, { wrong: number; total: number }> }) =>
		req<{ ok: boolean }>(`/api/topics/${encodeURIComponent(id)}/exam/attempt`, {
			method: 'POST',
			body: JSON.stringify(body)
		}),
	lesson: (id: string) => req<LessonDetail>(`/api/lessons/${encodeURIComponent(id)}`),
	completeLesson: (id: string, body: { kind: 'theory' | 'cards' | 'quiz'; score?: number; done?: boolean }) =>
		req<{ ok: boolean; xp: number; streak: number }>(`/api/lessons/${encodeURIComponent(id)}/complete`, {
			method: 'POST',
			body: JSON.stringify(body)
		}),
	due: (filter: ReviewFilter, limit = 50, scope?: { topics?: string[]; lessons?: string[]; categories?: string[]; extra?: boolean }) => {
		const q = new URLSearchParams({ filter, limit: String(limit) });
		if (scope?.topics?.length) q.set('topics', scope.topics.join(','));
		if (scope?.lessons?.length) q.set('lessons', scope.lessons.join(','));
		if (scope?.categories?.length) q.set('categories', scope.categories.join(','));
		if (scope?.extra) q.set('extra', '1');
		return req<{ cards: ReviewCard[] }>(`/api/review?${q.toString()}`);
	},
	sources: () => req<{ topics: PracticeSource[] }>(`/api/review/sources`),
	grade: (flashcard_id: string, known: boolean, cram = false) =>
		req<{ ok: boolean; xp: number; streak: number }>(`/api/review`, {
			method: 'POST',
			body: JSON.stringify({ flashcard_id, known, cram })
		}),
	stats: (days = 7) => req<Stats>(days === 7 ? `/api/stats` : `/api/stats?days=${days}`),
	classrooms: () => req<{ classrooms: Classroom[] }>(`/api/classrooms`),
	createClassroom: (name: string, subject: string) =>
		req<{ classroom: Classroom }>(`/api/classrooms`, {
			method: 'POST',
			body: JSON.stringify({ name, subject })
		}),
	joinClassroom: (code: string) =>
		req<{ ok: boolean }>(`/api/classrooms/join`, { method: 'POST', body: JSON.stringify({ code }) }),
	classroom: (id: string) =>
		req<{ classroom: Classroom; assignments: AssignmentRow[]; members: { name: string }[] }>(
			`/api/classrooms/${encodeURIComponent(id)}`
		),
	assignments: () => req<{ assignments: AssignmentRow[] }>(`/api/assignments`),
	buildAssessment: (body: {
		topic_id: string;
		topic_ids?: string[];
		title: string;
		max_attempts: number;
		time_limit_mins: number;
		shuffle: boolean;
		feedback_delayed: boolean;
		is_exam: boolean;
		count: number;
		lesson_ids?: string[];
	}) => req<{ assessment: { id: string } }>(`/api/assessments`, { method: 'POST', body: JSON.stringify(body) }),
	assessments: () => req<{ assessments: AssessmentRow[] }>(`/api/assessments`),
	mergeAssessments: (body: {
		assessment_ids: string[];
		title: string;
		max_attempts?: number;
		time_limit_mins?: number;
		shuffle?: boolean;
		feedback_delayed?: boolean;
		is_exam?: boolean;
	}) => req<{ assessment: { id: string } }>(`/api/assessments/merge`, { method: 'POST', body: JSON.stringify(body) }),
	assessment: (id: string) =>
		req<{ assessment: AssessmentRow; items: AssessmentItem[] }>(`/api/assessments/${encodeURIComponent(id)}`),
	deleteAssessment: (id: string) =>
		req<{ ok: boolean }>(`/api/assessments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
	updateAssessment: (id: string, body: { title: string }) =>
		req<{ ok: boolean }>(`/api/assessments/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			body: JSON.stringify(body)
		}),
	addAssessmentItem: (
		id: string,
		body: { question_text: string; type: string; options?: string[]; left?: string; correct_answer: string; pairs?: { left: string; right: string }[] }
	) =>
		req<{ item: { id: string } }>(`/api/assessments/${encodeURIComponent(id)}/items`, {
			method: 'POST',
			body: JSON.stringify(body)
		}),
	deleteAssessmentItem: (id: string) =>
		req<{ ok: boolean }>(`/api/assessment-items/${encodeURIComponent(id)}`, { method: 'DELETE' }),
	updateAssessmentItem: (
		id: string,
		body: { question_text?: string; type?: string; options?: string[]; left?: string; correct_answer?: string; pairs?: { left: string; right: string }[] }
	) =>
		req<{ ok: boolean }>(`/api/assessment-items/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			body: JSON.stringify(body)
		}),
	revokeAssignment: (id: string) =>
		req<{ ok: boolean }>(`/api/assignments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
	myCards: () =>
		req<{ topics: MyTopic[]; lessons: MyLesson[]; cards: MyCard[] }>(`/api/cards/mine`),
	messages: (classroomId: string) =>
		req<{ messages: MessageRow[] }>(`/api/classrooms/${encodeURIComponent(classroomId)}/messages`),
	sendMessage: (
		classroomId: string,
		body: { title: string; body?: string; link_url?: string; ref_type?: string; ref_id?: string }
	) =>
		req<{ message: { id: string } }>(`/api/classrooms/${encodeURIComponent(classroomId)}/messages`, {
			method: 'POST',
			body: JSON.stringify(body)
		}),
	deleteMessage: (id: string) =>
		req<{ ok: boolean }>(`/api/messages/${encodeURIComponent(id)}`, { method: 'DELETE' }),
	assign: (body: {
		assessment_id: string;
		classroom_id: string;
		due_date: number;
		max_attempts?: number;
		time_limit_mins?: number;
		shuffle?: boolean;
		feedback_delayed?: boolean;
		is_exam?: boolean;
		min_score?: number;
	}) =>
		req<{ assignment: { id: string } }>(`/api/assignments`, { method: 'POST', body: JSON.stringify(body) }),
	startSubmission: (assignmentId: string) =>
		req<{ items: QuizQ[]; submission_id: string; started_at: number; time_limit_mins: number; title: string }>(
			`/api/assignments/${encodeURIComponent(assignmentId)}/start`,
			{ method: 'POST' }
		),
	submitAssignment: (assignmentId: string, body: { submission_id: string; answers: Record<string, string> }) =>
		req<{ score: number; total: number; delayed: boolean; results?: { id: string; correct: boolean; answer: string }[] }>(
			`/api/assignments/${encodeURIComponent(assignmentId)}/submit`,
			{ method: 'POST', body: JSON.stringify(body) }
		),
	setRole: (role: string) =>
		req<{ ok: boolean; role: string }>(`/api/me/role`, { method: 'POST', body: JSON.stringify({ role }) })
};

/** Nagyon kis markdown-lite: címsor, félkövér, lista, idézet, bekezdés. XSS-biztos (escape-el). */
export function renderMarkdown(src: string): string {
	const esc = src
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
	const inline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
	const lines = esc.split('\n');
	let html = '';
	let inList = false;
	for (const line of lines) {
		if (line.startsWith('# ')) {
			if (inList) { html += '</ul>'; inList = false; }
			html += `<h3>${inline(line.slice(2))}</h3>`;
		} else if (line.startsWith('- ')) {
			if (!inList) { html += '<ul>'; inList = true; }
			html += `<li>${inline(line.slice(2))}</li>`;
		} else if (line.startsWith('> ')) {
			if (inList) { html += '</ul>'; inList = false; }
			html += `<blockquote>${inline(line.slice(2))}</blockquote>`;
		} else if (line.trim() === '') {
			if (inList) { html += '</ul>'; inList = false; }
		} else {
			if (inList) { html += '</ul>'; inList = false; }
			html += `<p>${inline(line)}</p>`;
		}
	}
	if (inList) html += '</ul>';
	return html;
}

// ---------- Beszéd (nyelvi témakörök) ----------

export function speak(text: string, lang = 'en-US'): void {
	try {
		if (!('speechSynthesis' in window)) return;
		window.speechSynthesis.cancel();
		const u = new SpeechSynthesisUtterance(text);
		u.lang = lang;
		u.rate = 0.9;
		window.speechSynthesis.speak(u);
	} catch {
		// nincs hang: csendben kihagyjuk
	}
}

export function canListen(): boolean {
	try {
		return typeof window !== 'undefined' &&
			!!((window as unknown as Record<string, unknown>).SpeechRecognition ||
				(window as unknown as Record<string, unknown>).webkitSpeechRecognition);
	} catch {
		return false;
	}
}

/** Egyszeri kiejtés-ellenőrzés: a felismert szöveg tartalmazza-e a célt (normalizálva). */
export function listenOnce(lang = 'en-US', timeoutMs = 8000): Promise<string> {
	return new Promise((resolve, reject) => {
		try {
			const W = window as unknown as Record<string, new () => {
				lang: string; interimResults: boolean; maxAlternatives: number;
				onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
				onerror: ((e: unknown) => void) | null;
				onend: (() => void) | null;
				start: () => void; stop: () => void;
			}>;
			const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
			if (!Ctor) { reject(new Error('no-sr')); return; }
			const rec = new Ctor();
			rec.lang = lang;
			rec.interimResults = false;
			rec.maxAlternatives = 3;
			let done = false;
			const timer = window.setTimeout(() => {
				if (!done) { done = true; try { rec.stop(); } catch { /* noop */ } reject(new Error('timeout')); }
			}, timeoutMs);
			rec.onresult = (e) => {
				if (done) return;
				done = true;
				window.clearTimeout(timer);
				try {
					const alts = e.results[0];
					let best = '';
					for (let i = 0; i < 3; i++) {
						try {
							const t = alts[i]?.transcript ?? '';
							if (t.length > best.length) best = t;
						} catch { /* noop */ }
					}
					resolve(best);
				} catch {
					reject(new Error('parse'));
				}
				try { rec.stop(); } catch { /* noop */ }
			};
			rec.onerror = (e) => {
				if (!done) { done = true; window.clearTimeout(timer); reject(new Error('speech')); }
			};
			rec.onend = () => {
				if (!done) { done = true; window.clearTimeout(timer); reject(new Error('empty')); }
			};
			rec.start();
		} catch {
			reject(new Error('no-sr'));
		}
	});
}

export function norm(s: string): string {
	return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

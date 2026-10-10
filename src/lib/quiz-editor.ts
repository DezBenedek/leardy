/* Kvízkészítő logika: típusok, validáció, sablonok.
   Lecke független modul, a lecke szerkesztő és a későbbi saját (privát)
   tanári kvízek ugyanazt használják. Szerződés: $lib/curriculum QuizQuestion. */

import type { QuizPair, QuizQuestion } from './curriculum';

import { QUESTION_TYPES, isQuestionType, loadQuestionOptions, questionType, storedQuestionOptions } from './question-types/registry';
import { normalizeQuestionImageUrl } from './question-image';
import type { QuestionTypeId } from './question-types/types';
export { QUESTION_TYPES, isQuestionType };
export type { QuestionTypeId };

export function questionTypeTitle(type: string): string { return questionType(type).title; }

/** Szerkesztői piszkozat: a szerver és a QuizQuestion közötti közös alak. */
export interface QuestionDraft {
	id: string;
	quizId: string;
	question_text: string;
	imageUrl?: string;
	type: string;
	options: string[];
	pairs: QuizPair[];
	correct_answer: string;
	sectionSlug: string;
	sort: number;
}

export interface QuizDraft {
	id: string;
	title: string;
	section_slug: string;
	sort: number;
	questions: QuestionDraft[];
}

export interface SectionOption {
	slug: string;
	title: string;
}

export function blankQuestion(quizId: string, type: string, sort = 0): QuestionDraft {
	const safe = isQuestionType(type) ? type : 'choice';
	return {
		id: '',
		quizId,
		question_text: '',
		type: safe,
		...questionType(safe).create(),
		sectionSlug: '',
		sort
	};
}

export function blankQuiz(sort = 0): QuizDraft {
	return { id: '', title: 'Új kvíz', section_slug: '', sort, questions: [] };
}

/** Piszkozatból a DB-ben tárolt options_json. */
export function draftOptionsJson(draft: Pick<QuestionDraft, 'type' | 'options' | 'pairs' | 'imageUrl'>): string {
	return JSON.stringify(storedQuestionOptions(draft.type, { ...draft, correct_answer: '' }));
}

/** Tárolt options_json visszafejtése szerkesztői alakba. */
export function parseOptionsJson(json: string): { options: string[]; pairs: QuizPair[]; imageUrl?: string } {
	try {
		const parsed: unknown = JSON.parse(json ?? '[]');
		if (Array.isArray(parsed) || (parsed && typeof parsed === 'object' && 'options' in parsed)) return loadQuestionOptions('choice', json);
		const loaded = loadQuestionOptions('match', json);
		return { ...loaded, options: [] };
	} catch {
		// hibás JSON: üresen indul a szerkesztő
	}
	return { options: [], pairs: [] };
}

/** Helyes válasz előállítása mentéshez, a teljes sorrenddel vagy párosítással. */
export function draftCorrectAnswer(draft: Pick<QuestionDraft, 'type' | 'options' | 'pairs' | 'correct_answer'>): string {
	return questionType(draft.type).correctAnswer(draft);
}

/** Kérdés ellenőrzése a futtató (QuizRunner) szabályai szerint. Hibaüzenet vagy null. */
export function validateQuestion(draft: Pick<QuestionDraft, 'question_text' | 'type' | 'options' | 'pairs' | 'correct_answer' | 'imageUrl'>): string | null {
	if (!draft.question_text.trim()) return 'Add meg a kérdés szövegét.';
	if (draft.question_text.trim().length > 1000) return 'A kérdés legfeljebb 1000 karakter lehet.';
	if (!isQuestionType(draft.type)) return 'Válassz egy támogatott kérdéstípust.';
	if (normalizeQuestionImageUrl(draft.imageUrl) === null) return 'Adj meg érvényes HTTP- vagy HTTPS-kép-URL-t.';
	return questionType(draft.type).validate(draft);
}

export function validateQuizTitle(title: string): string | null {
	if (!title.trim()) return 'Adj címet a kvíznek.';
	if (title.trim().length > 160) return 'A kvíz címe legfeljebb 160 karakter lehet.';
	return null;
}

/** Piszkozatból tanulói előnézethez való kérdés. */
export function draftToPreview(draft: QuestionDraft): QuizQuestion {
	const optionsJson = draftOptionsJson(draft);
	const { options, pairs, imageUrl } = loadQuestionOptions(draft.type, optionsJson);
	return {
		id: draft.id || 'elonezet',
		question_text: draft.question_text.trim() || 'Kérdés előnézet',
		type: draft.type,
		options,
		pairs,
		...(imageUrl ? { imageUrl } : {}),
		correct_answer: draftCorrectAnswer(draft),
		sectionSlug: draft.sectionSlug
	};
}

/** Kérdés szintű bekötés, különben a blokk szintű érvényes. */
export function effectiveSectionSlug(questionSlug: string, quizSlug: string): string {
	return (questionSlug || '').trim() || (quizSlug || '').trim();
}

export function totalQuestions(quizzes: Pick<QuizDraft, 'questions'>[]): number {
	return quizzes.reduce((n, q) => n + q.questions.length, 0);
}

/** A saját sablonokban tárolt kérdésadatok. */

export interface TemplateSeed {
	type: QuestionTypeId;
	title: string;
	subtitle: string;
	question_text: string;
	imageUrl?: string;
	options: string[];
	pairs: QuizPair[];
	correct_answer: string;
}

/* A saját sablonokat a bejelentkezett fiókhoz mentjük a szerveren. */

export interface CustomTemplate extends TemplateSeed {
	key: string;
	createdAt: number;
}

const CUSTOM_KEY = 'leardy:quiz-templates';

export function isTemplateSeed(value: unknown): value is TemplateSeed {
	if (!value || typeof value !== 'object') return false;
	const item = value as TemplateSeed;
	return typeof item.title === 'string' && typeof item.subtitle === 'string'
		&& typeof item.question_text === 'string' && typeof item.correct_answer === 'string'
		&& normalizeQuestionImageUrl(item.imageUrl) !== null
		&& isQuestionType(item.type) && Array.isArray(item.options) && item.options.every((option) => typeof option === 'string')
		&& Array.isArray(item.pairs) && item.pairs.every((pair) => pair && typeof pair.left === 'string' && typeof pair.right === 'string');
}

/** A régi, fiók nélküli tár csak kifejezett átvételhez olvasható. */
export function loadLegacyCustomTemplates(): CustomTemplate[] {
	try {
		const raw = localStorage.getItem(CUSTOM_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((t): t is CustomTemplate => {
				if (!t || typeof t !== 'object') return false;
				return 'key' in t && typeof t.key === 'string' && isTemplateSeed(t);
			})
			.filter((t, index, list) => list.findIndex((item) => item.key === t.key) === index)
			.slice(0, 30);
	} catch {
		return [];
	}
}

async function requestTemplates(method: 'GET' | 'POST' | 'DELETE', body?: object): Promise<CustomTemplate[]> {
	const response = await fetch('/api/quiz-templates', {
		method, credentials: 'same-origin', cache: 'no-store',
		...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
	});
	const result = await response.json().catch(() => null);
	if (!response.ok) throw new Error(result?.message ?? result?.error ?? 'A sablonok nem érhetők el. Próbáld újra.');
	if (!result || !Array.isArray(result.templates)) throw new Error('A sablonok válasza érvénytelen. Próbáld újra.');
	return result.templates;
}

export function loadCustomTemplates(): Promise<CustomTemplate[]> {
	return requestTemplates('GET');
}

export function saveCustomTemplate(seed: TemplateSeed): Promise<CustomTemplate[]> {
	return requestTemplates('POST', { templates: [seed] });
}

export function deleteCustomTemplate(key: string): Promise<CustomTemplate[]> {
	return requestTemplates('DELETE', { key });
}

export async function importLegacyCustomTemplates(templates: CustomTemplate[]): Promise<CustomTemplate[]> {
	const result = await requestTemplates('POST', { templates, legacy: true });
	// Csak a sikeres szervermentés után tüntetjük el az átvett helyi példányokat.
	try { localStorage.removeItem(CUSTOM_KEY); } catch { /* Az ismételt átvétel sem hoz létre másolatokat. */ }
	return result;
}

export function seedToDraft(seed: TemplateSeed, quizId: string, sort = 0): QuestionDraft {
	return {
		id: '',
		quizId,
		question_text: seed.question_text,
		...(seed.imageUrl ? { imageUrl: seed.imageUrl } : {}),
		type: seed.type,
		options: [...seed.options],
		pairs: seed.pairs.map((p) => ({ ...p })),
		correct_answer: seed.correct_answer,
		sectionSlug: '',
		sort
	};
}

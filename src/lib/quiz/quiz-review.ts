/* Utolsó kvízkitöltés átnézete: mi volt a hiba és mi a helyes.
   localStorage-ban él (eszközönként), drawer újranyitáskor is megmarad. */

import type { QuizQuestion } from '$lib/curriculum/curriculum';

export interface QuizMiss {
	question: string;
	mine: string;
	correct: string;
}

export interface QuizReview {
	score: number;
	total: number;
	pct: number;
	at: number;
	missed: QuizMiss[];
}

function key(classroomId: string, taskId: string): string {
	return `quiz-review:${classroomId}:${taskId}`;
}

export function saveQuizReview(classroomId: string, taskId: string, review: QuizReview): void {
	try {
		localStorage.setItem(key(classroomId, taskId), JSON.stringify(review));
	} catch {
		// tárhely nélkül is működik a felület
	}
}

export function loadQuizReview(classroomId: string, taskId: string): QuizReview | null {
	try {
		const raw = localStorage.getItem(key(classroomId, taskId));
		if (!raw) return null;
		const r = JSON.parse(raw) as QuizReview;
		if (!r || !Array.isArray(r.missed)) return null;
		return r;
	} catch {
		return null;
	}
}

/** Van-e értelme csak a rontottakat újra kérdezni: legalább egy rontott, de nem mind. */
export function canRetryMissed(total: number, missedCount: number): boolean {
	return Number.isFinite(total) && Number.isFinite(missedCount) && missedCount > 0 && missedCount < total;
}

/** A rontott kérdések kiválogatása újrapróbáláshoz. Sorrendet megtartja. */
export function selectMissedQuestions(
	questions: QuizQuestion[],
	isMiss: (question: QuizQuestion) => boolean
): QuizQuestion[] {
	return questions.filter(isMiss);
}

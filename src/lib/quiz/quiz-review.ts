/* Utolsó kvízkitöltés átnézete: mi volt a hiba és mi a helyes.
   localStorage-ban él (eszközönként), drawer újranyitáskor is megmarad. */

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

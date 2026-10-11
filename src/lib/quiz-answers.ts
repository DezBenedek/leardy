import type { QuizQuestion } from './curriculum';
import { questionType } from './question-types/registry';

export function correctQuizAnswer(question: QuizQuestion): string {
	return questionType(question.type).solution(question);
}

export function isQuizAnswerCorrect(question: QuizQuestion, answer: string | undefined): boolean {
	return answer !== undefined && questionType(question.type).isCorrect(question, answer);
}

export function formatQuizAnswer(question: QuizQuestion, answer: string): string {
	return questionType(question.type).formatAnswer(question, answer);
}

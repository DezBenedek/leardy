import type { QuizQuestion } from '../curriculum';
import type { GameQuestion } from '../games/types';
import type { RandomSource } from './types';

export function shuffle<T>(items: readonly T[], random: RandomSource = Math.random): T[] {
	const result = [...items];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

export function baseGameQuestion(question: QuizQuestion): GameQuestion {
	return { id: question.id, type: question.type, question_text: question.question_text, options: [] };
}

export function readOptions(raw: unknown): string[] {
	return Array.isArray(raw) ? raw.map(String) : [];
}

export function cleanOptions(options: string[]): string[] {
	return options.map((option) => option.trim()).filter(Boolean);
}

export function answerItems(answer: string | null): string[] | null {
	try {
		const value: unknown = JSON.parse(answer ?? 'null');
		return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
	} catch { return null; }
}

export function sameItems(answer: string, expected: string[]): boolean {
	const actual = answerItems(answer);
	return actual !== null && expected.length > 0 && actual.length === expected.length
		&& actual.every((item, index) => item === expected[index]);
}

export function normalizeAnswer(value: string): string {
	return value.trim().toLowerCase();
}

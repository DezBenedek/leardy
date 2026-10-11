import type { QuizPair } from '../../curriculum';
import { answerItems, baseGameQuestion, sameItems, shuffle } from '../shared';
import type { QuestionTypeDefinition } from '../types';

function cleanPairs(pairs: QuizPair[]): QuizPair[] {
	return pairs.map((pair) => ({ left: pair.left.trim(), right: pair.right.trim() })).filter((pair) => pair.left || pair.right);
}

export const match: QuestionTypeDefinition = {
	id: 'match',
	title: 'Összekötős',
	questionPlaceholder: 'Írd be a kérdést…',
	create: () => ({ options: [], pairs: [{ left: '', right: '' }, { left: '', right: '' }], correct_answer: '' }),
	readOptions(raw) {
		const list = raw && typeof raw === 'object' ? (raw as { pairs?: unknown }).pairs : undefined;
		const pairs = Array.isArray(list) ? list
			.filter((pair): pair is Record<string, unknown> => !!pair && typeof pair === 'object')
			.map((pair) => ({ left: String(pair.left ?? ''), right: String(pair.right ?? '') })) : [];
		return { options: pairs.map((pair) => pair.right), pairs };
	},
	storedOptions: ({ pairs }) => ({ pairs: cleanPairs(pairs) }),
	correctAnswer: ({ pairs }) => JSON.stringify(cleanPairs(pairs).map((pair) => pair.right)),
	solution: (question) => JSON.stringify(question.pairs.map((pair) => pair.right)),
	validate({ pairs: raw }) {
		const pairs = cleanPairs(raw);
		if (pairs.length < 2) return 'Adj meg legalább 2 párt.';
		if (pairs.length > 8) return 'Legfeljebb 8 pár adható meg.';
		if (pairs.some((pair) => pair.left.length > 200 || pair.right.length > 200)) return 'A párok egy-egy oldala legfeljebb 200 karakter lehet.';
		if (pairs.some((pair) => !pair.left || !pair.right)) return 'Minden pár mindkét oldalát töltsd ki.';
		if (new Set(pairs.map((pair) => pair.right)).size !== pairs.length) return 'A jobb oldalak nem ismétlődhetnek.';
		return null;
	},
	prepare(question, random) {
		return { ...baseGameQuestion(question), lefts: question.pairs.map((pair) => pair.left),
			leftOrder: shuffle(question.pairs.map((_, index) => index), random),
			options: shuffle(question.pairs.map((pair) => pair.right), random) };
	},
	isCorrect: (question, answer) => sameItems(answer, question.pairs.map((pair) => pair.right)),
	formatAnswer(question, answer) {
		const items = answerItems(answer);
		return items ? question.pairs.map((pair, index) => `${pair.left} → ${items[index] ?? 'nincs válasz'}`).join('; ') : answer;
	}
};

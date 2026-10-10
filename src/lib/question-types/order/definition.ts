import { answerItems, baseGameQuestion, cleanOptions, readOptions, sameItems, shuffle } from '../shared';
import type { QuestionTypeDefinition } from '../types';

export const order: QuestionTypeDefinition = {
	id: 'order',
	title: 'Sorrend',
	questionPlaceholder: 'Írd be a kérdést…',
	create: () => ({ options: ['', ''], pairs: [], correct_answer: '' }),
	readOptions: (raw) => ({ options: readOptions(raw), pairs: [] }),
	storedOptions: ({ options }) => cleanOptions(options),
	correctAnswer: ({ options }) => JSON.stringify(cleanOptions(options)),
	solution: (question) => question.correct_answer,
	validate({ options: raw }) {
		const options = cleanOptions(raw);
		if (options.length < 2) return 'Adj meg legalább 2 elemet.';
		if (options.length > 8) return 'Legfeljebb 8 elem adható meg.';
		if (options.some((option) => option.length > 200)) return 'Egy elem legfeljebb 200 karakter lehet.';
		if (new Set(options).size !== options.length) return 'Az elemek nem ismétlődhetnek.';
		return null;
	},
	prepare: (question, random) => ({ ...baseGameQuestion(question), options: shuffle(question.options, random) }),
	isCorrect: (question, answer) => sameItems(answer, answerItems(question.correct_answer) ?? []),
	formatAnswer: (_, answer) => answerItems(answer)?.join(' → ') ?? answer
};

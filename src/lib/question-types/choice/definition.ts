import { baseGameQuestion, cleanOptions, readOptions, shuffle } from '../shared';
import type { QuestionTypeDefinition } from '../types';

export const choice: QuestionTypeDefinition = {
	id: 'choice',
	title: 'Feleletválasztós',
	questionPlaceholder: 'Írd be a kérdést…',
	create: () => ({ options: ['', ''], pairs: [], correct_answer: '' }),
	readOptions: (raw) => ({ options: readOptions(raw), pairs: [] }),
	storedOptions: ({ options }) => cleanOptions(options),
	correctAnswer: ({ correct_answer }) => correct_answer.trim(),
	solution: (question) => question.correct_answer,
	validate(fields) {
		const options = cleanOptions(fields.options);
		if (options.length < 2) return 'Adj meg legalább 2 válaszlehetőséget.';
		if (options.length > 8) return 'Legfeljebb 8 válaszlehetőség adható meg.';
		if (options.some((option) => option.length > 200)) return 'Egy válaszlehetőség legfeljebb 200 karakter lehet.';
		if (new Set(options).size !== options.length) return 'A válaszlehetőségek nem ismétlődhetnek.';
		if (!fields.correct_answer.trim()) return 'Jelöld meg a helyes választ.';
		if (!options.includes(fields.correct_answer.trim())) return 'A helyes válasz a megadott lehetőségek közül kerüljön ki.';
		return null;
	},
	prepare: (question, random) => ({ ...baseGameQuestion(question), options: shuffle(question.options, random) }),
	isCorrect: (question, answer) => answer.trim() === question.correct_answer.trim(),
	formatAnswer: (_, answer) => answer
};

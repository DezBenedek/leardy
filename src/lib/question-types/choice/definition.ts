import { answerItems, baseGameQuestion, cleanOptions, readOptions, shuffle } from '../shared';
import type { QuestionTypeDefinition } from '../types';

export const choice: QuestionTypeDefinition = {
	id: 'choice',
	title: 'Feleletválasztós',
	description: 'Egy vagy több helyes válasz',
	questionPlaceholder: 'Írd be a kérdést…',
	create: () => ({ options: ['', ''], pairs: [], correct_answer: '' }),
	readOptions: (raw) => ({ options: readOptions(raw), pairs: [] }),
	storedOptions: ({ options }) => cleanOptions(options),
	correctAnswer: ({ correct_answer, settings }) => settings?.multiple ? JSON.stringify((answerItems(correct_answer) ?? []).map((item) => item.trim())) : correct_answer.trim(),
	solution: (question) => question.correct_answer,
	validate(fields) {
		const options = cleanOptions(fields.options);
		if (options.length < 2) return 'Adj meg legalább 2 válaszlehetőséget.';
		if (options.length > 8) return 'Legfeljebb 8 válaszlehetőség adható meg.';
		if (options.some((option) => option.length > 200)) return 'Egy válaszlehetőség legfeljebb 200 karakter lehet.';
		if (new Set(options).size !== options.length) return 'A válaszlehetőségek nem ismétlődhetnek.';
		const answers = fields.settings?.multiple ? answerItems(fields.correct_answer) ?? [] : [fields.correct_answer.trim()].filter(Boolean);
		if (!answers.length) return 'Jelöld meg a helyes választ.';
		if (answers.some((answer) => !options.includes(answer)) || new Set(answers).size !== answers.length) return 'A helyes válaszok a megadott lehetőségek közül kerüljenek ki.';
		return null;
	},
	prepare: (question, random) => ({ ...baseGameQuestion(question), options: shuffle(question.options, random), multiple: question.settings?.multiple ?? false }),
	isCorrect(question, answer) {
		if (!question.settings?.multiple) return answer.trim() === question.correct_answer.trim();
		const actual = answerItems(answer);
		const expected = answerItems(question.correct_answer);
		return !!actual && !!expected?.length && actual.length === expected.length && new Set(actual).size === actual.length && expected.every((item) => actual.includes(item));
	},
	formatAnswer: (question, answer) => question.settings?.multiple ? (answerItems(answer)?.join(', ') ?? answer) : answer
};

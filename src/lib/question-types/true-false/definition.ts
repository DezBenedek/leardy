import { baseGameQuestion, normalizeAnswer, shuffle } from '../shared';
import type { QuestionTypeDefinition } from '../types';

export const trueFalse: QuestionTypeDefinition = {
	id: 'tf',
	title: 'Igaz, hamis',
	questionPlaceholder: 'Írd le az állítást…',
	create: () => ({ options: [], pairs: [], correct_answer: 'Igaz' }),
	readOptions: () => ({ options: ['Igaz', 'Hamis'], pairs: [] }),
	storedOptions: () => ['Igaz', 'Hamis'],
	correctAnswer: ({ correct_answer }) => correct_answer.trim(),
	solution: (question) => question.correct_answer,
	validate: ({ correct_answer }) => correct_answer === 'Igaz' || correct_answer === 'Hamis' ? null : 'Válaszd ki: Igaz vagy Hamis a helyes.',
	prepare: (question, random) => ({ ...baseGameQuestion(question), options: shuffle(['Igaz', 'Hamis'], random) }),
	isCorrect: (question, answer) => normalizeAnswer(answer) === normalizeAnswer(question.correct_answer),
	formatAnswer: (_, answer) => answer
};

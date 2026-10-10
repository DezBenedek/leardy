import { baseGameQuestion, normalizeAnswer } from '../shared';
import type { QuestionTypeDefinition } from '../types';

export const text: QuestionTypeDefinition = {
	id: 'text',
	title: 'Rövid válasz (beírós)',
	questionPlaceholder: 'Írd be a kérdést…',
	create: () => ({ options: [], pairs: [], correct_answer: '' }),
	readOptions: () => ({ options: [], pairs: [] }),
	storedOptions: () => [],
	correctAnswer: ({ correct_answer }) => correct_answer.trim(),
	solution: (question) => question.correct_answer,
	validate({ correct_answer }) {
		if (!correct_answer.trim()) return 'Add meg az elfogadott választ.';
		if (correct_answer.trim().length > 200) return 'Az elfogadott válasz legfeljebb 200 karakter lehet.';
		return null;
	},
	prepare: (question) => baseGameQuestion(question),
	isCorrect: (question, answer) => normalizeAnswer(answer) === normalizeAnswer(question.correct_answer),
	formatAnswer: (_, answer) => answer
};

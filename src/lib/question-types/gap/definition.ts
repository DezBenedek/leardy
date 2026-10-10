import { answerItems, baseGameQuestion, cleanOptions, normalizeAnswer, readOptions, shuffle } from '../shared';
import type { QuestionTypeDefinition } from '../types';

export function gapParts(text: string): { text: string; index?: number }[] {
	const result: { text: string; index?: number }[] = [];
	let end = 0;
	let index = 0;
	for (const match of text.matchAll(/\[\[([^\[\]\n]*)\]\]/g)) {
		result.push({ text: text.slice(end, match.index) }, { text: match[1].trim(), index: index++ });
		end = match.index! + match[0].length;
	}
	result.push({ text: text.slice(end) });
	return result;
}
export function gapAnswers(text: string): string[] { return gapParts(text).filter((part) => part.index !== undefined).map((part) => part.text); }
export function completeAnswers(answer: string, expected: string[]): boolean {
	const actual = answerItems(answer);
	return !!actual && expected.length > 0 && actual.length === expected.length && actual.every((item, index) => normalizeAnswer(item) === normalizeAnswer(expected[index]));
}
export const gap: QuestionTypeDefinition = {
	id: 'gap', title: 'Hiányos szöveg', description: 'Behúzós, beírós vagy lenyílós mezők',
	questionPlaceholder: 'Egészítsd ki a szöveget!',
	create: () => ({ options: [], pairs: [], correct_answer: '', settings: { mode: 'drag', reusable: false, text: '' } }),
	readOptions: (raw) => ({ options: readOptions(raw), pairs: [] }),
	storedOptions: ({ options }) => cleanOptions(options),
	correctAnswer: ({ settings }) => JSON.stringify(gapAnswers(settings?.text ?? '')),
	solution: (question) => question.correct_answer,
	validate({ settings, options }) {
		if (!settings?.text?.trim()) return 'Add meg a kiegészítendő szöveget.';
		const answers = gapAnswers(settings.text);
		if (!answers.length) return 'Jelöld a hiányzó szavakat dupla szögletes zárójellel: [[szó]].';
		if (answers.length > 20) return 'Legfeljebb 20 hiányzó rész adható meg.';
		if (answers.some((answer) => !answer || answer.length > 200)) return 'A hiányzó részek 1 és 200 karakter közöttiek lehetnek.';
		if (gapParts(settings.text).filter((part) => part.index === undefined).some((part) => /\[\[|\]\]/.test(part.text))) return 'Ellenőrizd a hiányzó részek zárójeleit.';
		if (!settings.mode) return 'Válassz kitöltési módot.';
		if (options.length > 40 || options.some((item) => item.length > 200)) return 'Legfeljebb 40, egyenként 200 karakteres lehetőség adható meg.';
		return null;
	},
	prepare(question, random) {
		const answers = gapAnswers(question.settings?.text ?? '');
		return { ...baseGameQuestion(question), mode: question.settings?.mode ?? 'drag', reusable: question.settings?.reusable ?? false,
			gapText: (question.settings?.text ?? '').replace(/\[\[([^\[\]\n]*)\]\]/g, '[[]]'),
			options: question.settings?.mode === 'text' ? [] : shuffle(question.settings?.reusable || question.settings?.mode === 'dropdown'
				? [...new Set([...answers, ...question.options])] : [...answers, ...question.options], random) };
	},
	isCorrect: (question, answer) => completeAnswers(answer, gapAnswers(question.settings?.text ?? '')),
	formatAnswer: (_, answer) => answerItems(answer)?.map((item, i) => `${i + 1}. ${item || 'nincs válasz'}`).join('; ') ?? answer
};

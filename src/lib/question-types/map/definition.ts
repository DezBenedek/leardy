import { answerItems, baseGameQuestion, cleanOptions, readOptions, shuffle } from '../shared';
import { completeAnswers } from '../gap/definition';
import type { QuestionTypeDefinition } from '../types';

export const map: QuestionTypeDefinition = {
	id: 'map', title: 'Vaktérkép', description: 'Képmezők, válaszdobozok és állítható nyilak',
	questionPlaceholder: 'Nevezd meg a képen jelölt részeket!',
	create: () => ({ options: [], pairs: [], correct_answer: '', settings: { mode: 'drag', reusable: false, boxes: [] } }),
	readOptions: (raw) => ({ options: readOptions(raw), pairs: [] }),
	storedOptions: ({ options }) => cleanOptions(options),
	correctAnswer: ({ settings }) => JSON.stringify(settings?.boxes?.map((box) => box.answer.trim()) ?? []),
	solution: (question) => question.correct_answer,
	validate({ settings, imageUrl, options }) {
		if (!imageUrl) return 'Tölts fel egy képet a vaktérképhez.';
		if (!settings?.mode) return 'Válassz kitöltési módot.';
		if (!settings.boxes?.length) return 'Helyezz el legalább egy válaszmezőt a képen.';
		if (settings.boxes.length > 20) return 'Legfeljebb 20 válaszmező helyezhető el.';
		if (new Set(settings.boxes.map((box) => box.id)).size !== settings.boxes.length) return 'A válaszmezők azonosítói nem ismétlődhetnek.';
		if (settings.boxes.some((box) => !box.answer.trim() || box.answer.length > 200)) return 'Minden mezőhöz adj meg legfeljebb 200 karakteres helyes választ.';
		if (settings.boxes.some((box) => box.x < box.width / 2 || box.x > 100 - box.width / 2)) return 'A válaszmezők maradjanak a képen belül.';
		if (options.length > 40 || options.some((item) => item.length > 200)) return 'Legfeljebb 40, egyenként 200 karakteres lehetőség adható meg.';
		return null;
	},
	prepare(question, random) {
		const answers = question.settings?.boxes?.map((box) => box.answer.trim()) ?? [];
		return { ...baseGameQuestion(question), imageUrl: question.imageUrl, mode: question.settings?.mode ?? 'drag', reusable: question.settings?.reusable ?? false,
			boxes: question.settings?.boxes?.map(({ answer: _answer, ...box }) => ({ ...box, ...(box.arrow ? { arrow: { ...box.arrow } } : {}) })),
			options: question.settings?.mode === 'text' ? [] : shuffle(question.settings?.reusable || question.settings?.mode === 'dropdown'
				? [...new Set([...answers, ...question.options])] : [...answers, ...question.options], random) };
	},
	isCorrect: (question, answer) => completeAnswers(answer, question.settings?.boxes?.map((box) => box.answer.trim()) ?? []),
	formatAnswer: (_, answer) => answerItems(answer)?.map((item, i) => `${i + 1}. ${item || 'nincs válasz'}`).join('; ') ?? answer
};

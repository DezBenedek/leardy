import type { MapBox, QuestionSettings } from './types';

/** A kliens és a szerver ugyanazt a beállításformátumot fogadja el. */
export function readSettings(raw: unknown): QuestionSettings | undefined {
	if (raw === undefined) return undefined;
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Érvénytelen kérdésbeállítás.');
	const value = raw as Record<string, unknown>;
	const result: QuestionSettings = {};
	for (const key of ['multiple', 'reusable'] as const) {
		if (value[key] !== undefined) {
			if (typeof value[key] !== 'boolean') throw new Error('Érvénytelen kapcsoló.');
			result[key] = value[key];
		}
	}
	if (value.mode !== undefined) {
		if (value.mode !== 'drag' && value.mode !== 'text' && value.mode !== 'dropdown') throw new Error('Érvénytelen válaszmód.');
		result.mode = value.mode;
	}
	if (value.text !== undefined) {
		if (typeof value.text !== 'string' || value.text.length > 6000) throw new Error('A szöveg legfeljebb 6000 karakter lehet.');
		result.text = value.text;
	}
	if (value.boxes !== undefined) {
		if (!Array.isArray(value.boxes) || value.boxes.length > 20) throw new Error('Legfeljebb 20 mező helyezhető el.');
		result.boxes = value.boxes.map((raw): MapBox => {
			if (!raw || typeof raw !== 'object') throw new Error('Érvénytelen képmező.');
			const box = raw as MapBox;
			if (typeof box.id !== 'string' || !box.id || box.id.length > 80 || typeof box.answer !== 'string' || box.answer.length > 200
				|| !coordinate(box.x) || !coordinate(box.y) || typeof box.width !== 'number' || !Number.isFinite(box.width) || box.width < 10 || box.width > 60) throw new Error('Érvénytelen képmező.');
			if (box.arrow !== undefined && (!box.arrow || !coordinate(box.arrow.x) || !coordinate(box.arrow.y))) throw new Error('Érvénytelen nyílpont.');
			return { id: box.id, x: box.x, y: box.y, width: box.width, answer: box.answer,
				...(box.arrow ? { arrow: { x: box.arrow.x, y: box.arrow.y } } : {}) };
		});
	}
	return result;
}
function coordinate(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

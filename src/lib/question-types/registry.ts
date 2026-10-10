import type { QuizQuestion } from '../curriculum';
import { choice } from './choice/definition';
import { trueFalse } from './true-false/definition';
import { text } from './text/definition';
import { match } from './match/definition';
import { order } from './order/definition';
import { gap } from './gap/definition';
import { map } from './map/definition';
import { readSettings } from './settings';
import type { AnswerFields, QuestionTypeDefinition, QuestionTypeId } from './types';
import { normalizeQuestionImageUrl } from '../question-image';

export const QUESTION_TYPES: QuestionTypeDefinition[] = [choice, trueFalse, text, gap, match, order, map];

export function isQuestionType(type: string): type is QuestionTypeId {
	return QUESTION_TYPES.some((definition) => definition.id === type);
}

export function questionType(type: string): QuestionTypeDefinition {
	return QUESTION_TYPES.find((definition) => definition.id === type) ?? choice;
}

/** A tárolt sorrend megmarad, a megjelenítési sorrendet a típus külön készíti el. */
export function loadQuestionOptions(type: string, json: string): Omit<AnswerFields, 'correct_answer'> {
	try { return readQuestionOptions(type, JSON.parse(json)); }
	catch { return { options: [], pairs: [] }; }
}

/** A régi tömbös és páros formátumot, valamint a képpel bővített adatot is olvassa. */
export function readQuestionOptions(type: string, raw: unknown) {
	const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
	const answers = questionType(type).readOptions(object && 'options' in object ? object.options : raw);
	const imageUrl = normalizeQuestionImageUrl(object?.imageUrl);
	const settings = readSettings(object?.settings);
	return { ...answers, ...(imageUrl ? { imageUrl } : {}), ...(settings ? { settings } : {}) };
}

export function storedQuestionOptions(type: string, fields: Omit<AnswerFields, 'imageUrl'> & { imageUrl?: unknown }) {
	const imageUrl = normalizeQuestionImageUrl(fields.imageUrl);
	if (imageUrl === null) throw new Error('A kép URL-je érvénytelen.');
	const raw = questionType(type).storedOptions({ ...fields, imageUrl });
	const settings = readSettings(fields.settings);
	const stored = settings ? { ...(Array.isArray(raw) ? { options: raw } : raw as object), settings } : raw;
	if (!imageUrl) return stored;
	return Array.isArray(stored) ? { options: stored, imageUrl } : { ...stored as object, imageUrl };
}

export function prepareQuestion(question: QuizQuestion, random = Math.random) {
	return questionType(question.type).prepare(question, random);
}

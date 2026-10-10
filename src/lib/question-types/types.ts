import type { QuizPair, QuizQuestion } from '../curriculum';
import type { GameQuestion } from '../games/types';
import type { QuestionDraft } from '../quiz-editor';

export type QuestionTypeId = 'choice' | 'tf' | 'text' | 'match' | 'order' | 'gap' | 'map';
export type InputMode = 'drag' | 'text' | 'dropdown';
export interface MapBox {
	id: string;
	x: number;
	y: number;
	width: number;
	answer: string;
	arrow?: { x: number; y: number };
}
export interface QuestionSettings {
	multiple?: boolean;
	mode?: InputMode;
	reusable?: boolean;
	text?: string;
	boxes?: MapBox[];
}
export type AnswerFields = { options: string[]; pairs: QuizPair[]; correct_answer: string; settings?: QuestionSettings; imageUrl?: string };
export type RandomSource = () => number;

/** Egy típus teljes adatszerződése, a szerkesztőtől a kiértékelésig. */
export interface QuestionTypeDefinition {
	id: QuestionTypeId;
	title: string;
	description?: string;
	questionPlaceholder: string;
	create: () => AnswerFields;
	readOptions: (raw: unknown) => { options: string[]; pairs: QuizPair[] };
	storedOptions: (fields: AnswerFields) => unknown;
	correctAnswer: (fields: AnswerFields) => string;
	solution: (question: QuizQuestion) => string;
	validate: (fields: AnswerFields) => string | null;
	prepare: (question: QuizQuestion, random: RandomSource) => GameQuestion;
	isCorrect: (question: QuizQuestion, answer: string) => boolean;
	formatAnswer: (question: QuizQuestion, answer: string) => string;
}

export interface QuestionEditorProps {
	draft: QuestionDraft;
	saving: boolean;
	onChange: () => void;
}

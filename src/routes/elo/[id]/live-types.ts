import type { QuizQuestion } from '$lib/curriculum/curriculum';

export type LiveStatus = 'lobby' | 'live' | 'done';

export interface LiveParticipant {
	id: string;
	name: string;
	answered?: number;
	total?: number;
	correct?: number;
	score?: number;
}

export interface LiveAnswerDetail {
	index: number;
	answer: string;
	ok: boolean;
}

export interface LiveStudentDetail {
	userId: string;
	name: string;
	answers: LiveAnswerDetail[];
}

export interface LivePayload {
	status: LiveStatus;
	isDraft: boolean;
	title: string;
	classroomId: string;
	isTeacher: boolean;
	playMode: 'solo' | 'stage';
	pacing: 'self' | 'synced';
	questions: QuizQuestion[];
	index: number;
	locked: boolean;
	participants: LiveParticipant[];
	joined: boolean;
	myScore: number;
	myTotal: number;
	ranking: { name: string; score: number; userId?: string }[];
	/** Tanári nézetben: kérdésindex -> válasz -> darab (csak diákok). */
	dist: Record<string, Record<string, number>>;
	/** Tanári nézetben: diákonként a leadott válaszok. */
	details: LiveStudentDetail[];
}

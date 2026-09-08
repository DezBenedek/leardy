// Globális lejátszó: a kártya- és kvízlejátszó mindig teljes oldalas átvételben (overlay)
// nyílik, bárhonnan indítható. Jobb fent: cím + Kilépés.

import type { Card, QuizQ } from './study';

export interface CardsSession {
	kind: 'cards';
	title: string;
	subtitle?: string;
	cards: Card[];
	/** Nyelvi mód (audió + kiejtés). 'auto' = kártyánként a topic_type dönt (vegyes ismétlő sor). */
	isLanguage: boolean | 'auto';
	/** A "Nem tudom" a sor végére pörögjön vissza. */
	repeatUnknown: boolean;
	/** Magolás: vége, ha minden kártyára jött egyszer "Tudom". */
	untilAllKnown: boolean;
	onGrade: (card: Card, known: boolean) => void | Promise<void>;
	onFinish: (graded: number) => void;
}

export interface QuizSession {
	kind: 'quiz';
	title: string;
	subtitle?: string;
	questions: QuizQ[];
	/** false = éles dolgozat: nincs megoldás-mutatás. */
	reveal: boolean;
	timeLimitMins?: number;
	startedAt?: number;
	submitLabel?: string;
	onFinish: (score: number, total: number, answers: Record<string, string>) => void;
}

export type PlayerSession = CardsSession | QuizSession;

class PlayerStore {
	session = $state<PlayerSession | null>(null);

	openCards(s: Omit<CardsSession, 'kind'>): void {
		this.session = { ...s, kind: 'cards' };
	}

	openQuiz(s: Omit<QuizSession, 'kind'>): void {
		this.session = { ...s, kind: 'quiz' };
	}

	close(): void {
		this.session = null;
	}

	get isOpen(): boolean {
		return this.session !== null;
	}
}

export const player = new PlayerStore();

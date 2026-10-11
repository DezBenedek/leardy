// Kvíz-játékok közös típusai. Minden játék egy kérdés megválaszolására való,
// saját belső állapottal; a válasz leadása után a szülő (QuizPlayer) léptet.

export interface GameQuestion {
	id: string;
	question_text: string;
	type: string;
	options: string[];
	imageUrl?: string;
	multiple?: boolean;
	mode?: import('../question-types/types').InputMode;
	reusable?: boolean;
	gapText?: string;
	boxes?: Omit<import('../question-types/types').MapBox, 'answer'>[];
	left?: string;
	/** A teljes párosítós feladat bal oldalai, a helyes párok felfedése nélkül. */
	lefts?: string[];
	/** A bal oldalak kevert megjelenítési sorrendje, eredeti indexekkel. */
	leftOrder?: number[];
}

export interface GameProps {
	q: GameQuestion;
	onAnswer: (answer: string) => void;
	/** Leadott válasz (kiértékelés után; addig null) */
	picked?: string | null;
	/** Helyes válasz, amit csak gyakorlásban adunk át (élesben null) */
	correct?: string | null;
}

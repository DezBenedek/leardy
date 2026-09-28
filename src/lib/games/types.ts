// Kvíz-játékok közös típusai. Minden játék egy kérdés megválaszolására való,
// saját belső állapottal; a válasz leadása után a szülő (QuizPlayer) léptet.

export interface GameQuestion {
	id: string;
	question_text: string;
	type: string;
	options: string[];
	left?: string;
}

export interface GameProps {
	q: GameQuestion;
	onAnswer: (answer: string) => void;
	/** Leadott válasz (kiértékelés után; addig null) */
	picked?: string | null;
	/** Helyes válasz, amit csak gyakorlásban adunk át (élesben null) */
	correct?: string | null;
}

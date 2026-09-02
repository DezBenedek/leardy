export type SourceCard = {
	id: string;
	front: string;
	back: string;
	hint?: string | null;
	example?: string | null;
};

export type QuestionKind = "choice" | "type";

export type QuizQuestion = {
	idx: number;
	cardId: string;
	kind: QuestionKind;
	prompt: string;
	choices: string[];
	correctIndex: number;
	expected: string;
};

function shuffle<T>(items: T[]): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const bytes = crypto.getRandomValues(new Uint8Array(1));
		const j = bytes[0]! % (i + 1);
		[copy[i], copy[j]] = [copy[j]!, copy[i]!];
	}
	return copy;
}

function asChoice(card: SourceCard, cards: SourceCard[], idx: number): QuizQuestion {
	const distractors = cards.filter((other) => other.id !== card.id).map((other) => other.back);
	const uniqueDistractors = [...new Set(distractors.filter((back) => back !== card.back))];
	const picked = shuffle(uniqueDistractors).slice(0, 3);
	const choices = shuffle([card.back, ...picked]);
	return {
		idx,
		cardId: card.id,
		kind: "choice",
		prompt: card.front,
		choices,
		correctIndex: choices.indexOf(card.back),
		expected: card.back,
	};
}

function asType(card: SourceCard, idx: number): QuizQuestion {
	return {
		idx,
		cardId: card.id,
		kind: "type",
		prompt: card.front,
		choices: [],
		correctIndex: -1,
		expected: card.back,
	};
}

export function buildQuestions(cards: SourceCard[], mode: "choice" | "type" | "random" = "choice"): QuizQuestion[] {
	return cards.map((card, idx) => {
		if (mode === "type" || cards.length < 2) return asType(card, idx);
		if (mode === "choice") return asChoice(card, cards, idx);
		const pick = crypto.getRandomValues(new Uint8Array(1))[0]! % 2 === 0 ? "choice" : "type";
		return pick === "type" ? asType(card, idx) : asChoice(card, cards, idx);
	});
}

export function normalizeAnswer(value: string) {
	return value.toLowerCase().trim().replace(/\s+/g, " ");
}

export function typedMatches(typed: string, expected: string) {
	return normalizeAnswer(typed) === normalizeAnswer(expected);
}

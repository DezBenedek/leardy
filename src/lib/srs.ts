// Egyszerűsített SM-2 ismétlési algoritmus (SRS).
// grade: 0 = újra, 1 = nehéz, 2 = tudom, 3 = könnyű

export type Grade = 0 | 1 | 2 | 3;

export interface SrsState {
	cardId: string;
	ease: number;
	interval: number; // nap
	reps: number;
	lapses: number;
	due: number; // epoch ms
}

export function freshSrs(cardId: string, now = Date.now()): SrsState {
	return { cardId, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now };
}

const MINUTE = 60_000;
const DAY = 86_400_000;

export function gradeSrs(prev: SrsState, grade: Grade, now = Date.now()): SrsState {
	let { ease, interval, reps, lapses } = prev;

	if (grade === 0) {
		lapses += 1;
		reps = 0;
		interval = 0;
		ease = Math.max(1.3, ease - 0.2);
		return { cardId: prev.cardId, ease, interval, reps, lapses, due: now + 10 * MINUTE };
	}

	reps += 1;
	if (grade === 1) {
		ease = Math.max(1.3, ease - 0.15);
		interval = Math.max(1, Math.round(interval * 1.2));
	} else if (grade === 2) {
		if (reps === 1) interval = 1;
		else if (reps === 2) interval = 6;
		else interval = Math.round(interval * ease);
	} else {
		ease = Math.min(3, ease + 0.15);
		interval = Math.round(Math.max(1, interval) * ease * 1.3) + (reps <= 2 ? 1 : 0);
		if (reps === 1) interval = Math.max(interval, 4);
	}

	return { cardId: prev.cardId, ease, interval, reps, lapses, due: now + interval * DAY };
}

/** Egy gyakorlásért járó XP az osztályzat alapján. */
export function xpForGrade(grade: Grade): number {
	return grade === 0 ? 1 : grade === 1 ? 3 : grade === 2 ? 5 : 8;
}

// ---------- régi rendszerből áthozva (domain/srs.dart) ----------

/** Gépelős válasz osztályzása a helyesség + eltelt idő alapján. */
export function gradeFromTyped(correct: boolean, elapsedMs: number): Grade {
	if (!correct) return 0;
	if (elapsedMs < 2500) return 3;
	if (elapsedMs < 8000) return 2;
	return 1;
}

/** Feleletválasztós válasz osztályzása a helyesség + eltelt idő alapján. */
export function gradeFromChoice(correct: boolean, elapsedMs: number): Grade {
	if (!correct) return 0;
	if (elapsedMs < 4000) return 3;
	return 2;
}

/** Tudásszint-számláló: 0-ról indul, helyes +1, rontott −1 (0–4). */
export function bumpLevel(level: number, correct: boolean): number {
	return Math.min(4, Math.max(0, level + (correct ? 1 : -1)));
}

/** Tudásszint-kulcs a 0–4-es számlálóból a feliratokhoz. */
export function levelKeyFor(level: number): 'zero' | 'veryHard' | 'hard' | 'medium' | 'easy' {
	if (level <= 0) return 'zero';
	if (level === 1) return 'veryHard';
	if (level === 2) return 'hard';
	if (level === 3) return 'medium';
	return 'easy';
}

export function normalizeAnswer(value: string): string {
	return value.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,!?;:]/g, '');
}

export function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (!a) return b.length;
	if (!b) return a.length;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	const curr = new Array<number>(b.length + 1).fill(0);
	for (let i = 0; i < a.length; i++) {
		curr[0] = i + 1;
		for (let j = 0; j < b.length; j++) {
			const cost = a[i] === b[j] ? 0 : 1;
			curr[j + 1] = Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost);
		}
		prev = [...curr];
	}
	return prev[b.length];
}

/** Elírást tűrő egyezés: rövid szónál 1, hosszúnál 2 hiba fér bele. */
export function fuzzyMatch(typed: string, expected: string): boolean {
	const a = normalizeAnswer(typed);
	const b = normalizeAnswer(expected);
	if (a === b) return true;
	if (!a) return false;
	const allowed = b.length <= 4 ? 1 : 2;
	return levenshtein(a, b) <= allowed;
}

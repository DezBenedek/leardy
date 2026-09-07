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

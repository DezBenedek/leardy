import { browser } from '$app/environment';

/* Kártyacsomag-megnyitások naplója (localStorage: leardy-deck-opened).
   A könyvtár "Legutóbb megnyitott" rendezése ebből dolgozik: a szerver
   nem jegyzi a megnyitást, csak a mentést, ezért ez eszközönkénti lista.
   Plusz ékezet-érzéketlen szöveg-normalizáló a keresőkhöz. */

const KEY = 'leardy-deck-opened';
const MAX_ENTRIES = 200;

export function loadDeckOpened(): Record<string, number> {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object') return {};
		const out: Record<string, number> = {};
		for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
		}
		return out;
	} catch {
		return {};
	}
}

export function markDeckOpened(quizId: string): void {
	if (!browser || !quizId) return;
	try {
		const map = loadDeckOpened();
		map[quizId] = Date.now();
		const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, MAX_ENTRIES);
		localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
	} catch {
		// tiltott storage: nincs mit tenni
	}
}

/** Ékezet-érzéketlen, kisbetűs alak kereséshez ("történelem" = "tortenelem"). */
export function normHu(s: string): string {
	return s
		.toLocaleLowerCase('hu-HU')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

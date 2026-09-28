import { browser } from '$app/environment';
import type { AppSettings } from '$lib/settings';

/* Megjelenési beállítások alkalmazása a <html> elemen.
   - data-lefontfam: system | modern | book (betűtípus)
   - .reduce-motion: animációk kikapcsolása (az OS prefers-reduced-motion mellé)
   - .compact: sűrűbb listák, kisebb térközök
   Az alapszöveg mérete fix (lásd app.css), nincs hozzá beállítás.
   A Beállítások oldal és a layout is hívja, az app.html pedig már az első
   paint előtt beállítja ugyanezt a villanás ellen. */

type DisplayPick = Pick<AppSettings, 'fontFamily' | 'reduceMotion' | 'compactList'>;

export function applyDisplaySettings(s: DisplayPick): void {
	if (!browser) return;
	try {
		const el = document.documentElement;
		el.dataset.lefontfam = s.fontFamily;
		el.classList.toggle('reduce-motion', s.reduceMotion);
		el.classList.toggle('compact', s.compactList);
	} catch {
		// nem kritikus
	}
}

/* Animálhat-e az app most? Hamis, ha a felhasználó a Beállításokban
   kikapcsolta a mozgást, vagy az OS kér nyugodt felületet.
   A Drawer, a Sheet és az oldal-áttűnés ezt nézi, mert a JS-vezérelt
   mozgásokat (Svelte transition, rAF) a CSS-szabály nem állítja le. */
export function shouldAnimate(): boolean {
	if (!browser) return false;
	try {
		if (document.documentElement.classList.contains('reduce-motion')) return false;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
	} catch {
		// ismeretlen környezet: inkább animálunk
		return true;
	}
	return true;
}

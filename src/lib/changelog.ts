import { browser } from '$app/environment';

/* Újdonság-bejelentések ("Frissítés - VERZIÓSZÁM" felugró).
   ------------------------------------------------------------------
   HOGYAN TEGYÉL KI ÚJ BEJELENTÉST? (manuális, 3 lépés)

   1. Írd át a verziószámot a package.json "version" mezőjében.
   2. Szúrj be egy új bejegyzést a CHANGES lista TETEJÉRE ezzel
      a verziószámmal, jó megfogalmazással (cím + 2-4 pont).
   3. Deploy. Mindenki legfeljebb 1x látja a felugrót, bezáráskor
      megjegyezzük a localStorage-ban (leardy-whatsnew-seen).

   Ha nincs új bejegyzés, nincs felugró. Ilyen egyszerű.
   ------------------------------------------------------------------ */

export interface ChangeItem {
	title: string;
	desc: string;
}

export interface ChangeEntry {
	version: string;
	title: string;
	items: ChangeItem[];
}

export const CHANGES: ChangeEntry[] = [
	{
		version: '0.0.1-beta',
		title: 'Megjelent az első beta',
		items: [
			{
				title: 'Tanulás egy helyen',
				desc: 'Leckék, kvízek és szókártyák haladás mentéssel, minden eszközön.'
			},
			{
				title: 'Tanterem osztályokkal',
				desc: 'Határidős kvízek és beadandók, tanári értékeléssel és értesítésekkel.'
			},
			{
				title: 'Könyvtár és saját csomagok',
				desc: 'Tantárgyak szerinti gyűjtemény, saját kártyacsomagok leckékhez csatolva.'
			},
			{
				title: 'Emlékeztetők és újdonságok',
				desc: 'Napi emlékeztető, tantermi jelzések és frissítési felugró az újdonságokról.'
			}
		]
	}
];

/** Mindig a legfrissebb bejegyzés: ezt mutatja a felugró. */
export const LATEST_CHANGE: ChangeEntry = CHANGES[0];

const SEEN_KEY = 'leardy-whatsnew-seen';

export function getSeenWhatsNew(): string {
	if (!browser) return '';
	try {
		return localStorage.getItem(SEEN_KEY) ?? '';
	} catch {
		return '';
	}
}

export function markWhatsNewSeen(version: string): void {
	if (!browser) return;
	try {
		localStorage.setItem(SEEN_KEY, version);
	} catch {
		// tiltott storage: legfeljebb újra megjelenik
	}
}

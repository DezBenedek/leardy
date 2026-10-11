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
		version: '1.0.0-beta',
		title: 'Első béta kiadás',
		items: [
			{
				title: 'Interaktív útmutató',
				desc: 'Végigvezet a Tanuláson, a Kártyákon és a Tantermen, később a Beállítások alatt bármikor újranyitható.'
			},
			{
				title: 'Tanulás egy helyen',
				desc: 'Leckék, kvízek és szókártyák haladás mentéssel, tantárgy és szint szerint rendezve.'
			},
			{
				title: 'Tanterem osztályokkal',
				desc: 'Határidős kvízek és beadandók tanári értékeléssel, üzenetekkel és jegyekkel.'
			},
			{
				title: 'Offline működés',
				desc: 'A megnyitott leckék és kártyák internet nélkül is elérhetők, a tárhely a Beállítások alatt üríthető.'
			},
			{
				title: 'Megbízható értesítések',
				desc: 'Push üzenet feladatról, jegyről és határidőről zárt alkalmazásnál is, egygombos bekapcsolással.'
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

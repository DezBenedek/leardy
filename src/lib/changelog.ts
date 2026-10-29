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
		version: '1.1.0-beta',
		title: 'Élő dolgozat a tanteremben',
		items: [
			{
				title: 'Valós idejű dolgozat',
				desc: 'A tanár leckékből vagy kártyacsomagokból hirdethet dolgozatot, a diákok élőben csatlakoznak. Együtt haladás, tantermi mód táblával és azonnali szavazateloszlás.'
			},
			{
				title: 'Piszkozatok és értesítés',
				desc: 'A dolgozat piszkozatként is menthető, meghirdetéskor az osztály push értesítést kap. A falon az aktív, a piszkozat és a korábbi dolgozatok is látszanak.'
			},
			{
				title: 'Szógyakorlás kapcsoló',
				desc: 'A főoldali szavak szakasz a Tanulás beállításoknál ki és be kapcsolható, nyelvenként is szűrhető.'
			},
			{
				title: 'Apró simítások',
				desc: 'Kétlépcsős törlés a könyvtári csomagnál, nyugodt módban villanásmentes felugrók, a szerkesztő eszköztára a sáv szélességéhez igazodik.'
			}
		]
	},
	{
		version: '1.0.4-beta',
		title: 'Kényelmesebb szerkesztők és stabilabb felugrók',
		items: [
			{
				title: 'Rendezettebb táblázatok',
				desc: 'Beszúrás méretválasztóval, műveletek átlátható menüben. Az ikon csak táblázatban látszik, a szövegstílus és telefonon a beszúrás is csak ikon.'
			},
			{
				title: 'Egyszerűbb tananyag-beállítások',
				desc: 'A név mellett mentés ikon van, a publikálás kapcsoló azonnal ment. Szerkesztőt név alapján is kereshetsz.'
			},
			{
				title: 'Stabil újdonság-ablak',
				desc: 'Fix magasság, tartalomváltáskor sem ugrál. Egérrel is oldalra húzható a lapozás.'
			},
			{
				title: 'Apró simítások',
				desc: 'A bekezdés-gomb a témakör-gomb stílusát kapta, a szavak listáján javult a hover.'
			}
		]
	},
	{
		version: '1.0.3-beta',
		title: 'Finomabb panelek és menük',
		items: [
			{
				title: 'Folyamatos lehúzás',
				desc: 'A lista tetején a panel követi az ujjadat. Rövid húzásra visszasimul, hosszabb lehúzásra bezárul.'
			},
			{
				title: 'Törlés szerkesztés közben',
				desc: 'A tanári üzenettörlés az üzenet szerkesztésébe került.'
			},
			{
				title: 'Jobban nyíló menük',
				desc: 'A leckemenü visszakapta a korábbi méretét. Az animáció a menü nyitási irányát követi.'
			}
		]
	},
	{
		version: '1.0.2-beta',
		title: 'Egyszerűbb felületek, kényelmesebb használat',
		items: [
			{
				title: 'Egyszerűbb beállítások',
				desc: 'Push aktiválása egy gombbal, aktív állapotnál zöld pipával. Rövidebb, átláthatóbb tanulási beállítások.'
			},
			{
				title: 'Javított mobilos megjelenés',
				desc: 'Egységes háttér a telefon alsó sávjánál és billentyűzet használatakor. Eltűntek az offline figyelmeztetések.'
			},
			{
				title: 'Üzenettörlés a tanteremben',
				desc: 'A tanár az üzenet részleteinél törölheti a bejegyzést.'
			},
			{
				title: 'Kényelmesebb szerkesztés',
				desc: 'Külön mentésikon és kisebb műveleti menü. Üres tantárgynál a választóban csak az új tananyag gombja jelenik meg.'
			}
		]
	},
	{
		version: '1.0.1-beta',
		title: 'Kényelmesebb tanterem és beadandók',
		items: [
			{
				title: 'Rugalmasabb tananyagcsatolás',
				desc: 'A választó az osztály tantárgyáról indul, de másikra is válthatsz. Az üzenetek csatolmányai és a feladatok leckéi utólag is módosíthatók.'
			},
			{
				title: 'Átláthatóbb beadandók és értékelés',
				desc: 'A beküldött válasz olvasási nézetben jelenik meg, fölötte a tanári értékeléssel. A tanári szűrő telefonon lenyíló listát, gépen animált váltást kapott.'
			},
			{
				title: 'Könnyebben kezelhető képkivágás',
				desc: 'A téglalapos kivágás mind a négy sarka elérhető telefonon is. Javult a forgatás és a tükrözés, a kész kép sarkai szögletesek maradnak.'
			},
			{
				title: 'Javított kereső és útmutató',
				desc: 'A keresőikon a mező bal szélén marad, a helyőrző keskeny nézetben is látható. Az útmutató nyitóablakának ikonja a cím mellé került.'
			}
		]
	},
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

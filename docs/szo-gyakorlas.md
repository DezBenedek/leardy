# Szógyakorlás algoritmusa

Ez a leírás a Leardy szókártya-gyakorlójának működését foglalja össze.
Célja, hogy fejlesztőként és érdeklődő tanulóként is pontosan lásd,
mikor melyik szó kerül sorra, hogyan frissül a tudásszint,
és miben tér el az egyedi csomagos és az összesített gyakorlás.

Kapcsolódó fájlok:

- `src/lib/sm2.ts`: az ütemező és a sorrend logikája
- `src/lib/components/WordPractice.svelte`: a gyakorló felület és a menetvezérlés
- `src/lib/card-review.svelte`: a válaszok gyűjtése és mentése
- `src/routes/szavak/[subjectId]/+page.svelte`: nyelvi összesített gyakorlás
- `src/routes/kartyak/[id]/+page.svelte`: egyedi csomag adatlapja és gyakorlója
- `src/routes/+page.svelte`: főoldali szógyakorlás szakasz

## 1. Alapfogalmak

Minden kártyához egy haladási rekord tartozik:

- `seen`: hányszor találkoztál a kártyával
- `known`: az egymás utáni sikeres válaszok száma
- `repetitions`: az SM-2 ismétlési számlálója
- `ease`: könnyűségi tényező, 1,3 és 3,2 között
- `intervalDays`: hány nap múlva esedékes legközelebb
- `dueDay`: melyik napon esedékes, nap sorszámmal mérve

A nap sorszámát a `todayDay()` adja Európa/Budapest időzónában.
A kliens és a szerver ugyanakkor vált napot, téli és nyári időszámításkor is.

A tárolás takarékos: csak a már megérintett kártyákhoz jön létre sor
a `card_progress` táblában. Új sor ismétléskor nem keletkezik,
a meglévő sor frissül.

## 2. Osztályzás: Tudom vagy Nem tudom

A felület bináris: jobbra húzás vagy a Tudom gomb sikert,
balra húzás vagy a Nem tudom gomb hibát jelent.
Billentyűzettel a jobbra és balra nyíl, felfedésre a szóköz vagy az Enter használható.

A `qualityFor()` leképezése:

- Tudom: 4-es minőség
- Nem tudom: 1-es minőség

A `gradeSM2()` ebből számol új állapotot a klasszikus SM-2 lépéssel:

- 3-as vagy jobb minőségnél az intervallum nő: 0. ismétlés után 1 nap,
  1. ismétlés után 6 nap, később felfelé kerekítve `intervallum * ease`.
- 3-as alatti minőségnél az ismétlésszámláló nullázódik, az intervallum 1 nap.
- A könnyűség a válasz minőségétől függően változik, alsó korlátja 1,3,
  felső korlátja 3,2, alapértéke 2,5.
- Az intervallum legfeljebb 3650 nap lehet.

Két fontos finomítás van a túl gyors felejtés és a túl ritka ismétlés ellen:

1. Egy napon belüli gyakorlás nem növelheti többször az ismétlési időt.
   Ha ma már láttad a kártyát és még nem esedékes, a sikeres válasz
   megtartja az ütemezést, nem tolja távolabb.
2. A hibás szó sikeres újrapróbálása az egynapos lépésre kerül vissza,
   nem ugrik rögtön több napot.

A `known` mező az egymás utáni sikereket számolja.
A csomagonkénti összesítésben a `known >= 2` kártya számít megtanulnak.

## 3. Gyakorló sorrend

### 3.1 Kártyaállapotok

A `buildWordQueue()` minden kártyát három csoportba sorol:

- `isNew`: még sosem láttad (`seen === 0` és `repetitions === 0`)
- `isDue`: esedékes, mert `dueDay <= today`
- `isFuture`: jövőbeli, mert `dueDay > today`

Új kártya mindig esedékesnek számít.

### 3.2 Rendezés

A sorrend nyugodt és stabil, nincs keverés:

1. Csomagcsoport: egy csomag kártyái mindig együtt jönnek.
2. Csomagon belül: előbb a lejárt esedékesek a lejárat sorrendjében,
   aztán az új kártyák, végül az eredeti sorrend dönt.
3. Csomagok között: a legutóbb megnyitott csomagok vannak elöl,
   aztán a megadott csomagsorrend, az ismeretlen a legvégén.

Az összesített nyelvi oldalon a legutóbb megnyitott legfeljebb 3 csomag
kerül előre, a részletezőben látható csomagsorrend szerint.

### 3.3 Szűrés: mikor marad ki kártya

Alapból a jövőbeli kártya nem kerül a sorba.
Amit ma már tudtál, az újranyitáskor sem jön vissza.
Ez a napi ritmust védi: csak az esedékes és új szavak jönnek.

Két kivétel van:

- Direkt csomagnyitás `includeFuture` módban: semmi nem marad ki.
- Rövid átismétlő kör: ha nincs esedékes szó, a rendszer a legbizonytalanabb
  kártyákból állít össze egy legfeljebb 20-as kört.

### 3.4 Napi kör és átismétlés

A `buildDailyWordQueue()` logikája:

1. Először az esedékes és új szavak jönnek.
2. Ha ez üres, akkor átismétlő kör indul a jövőbeli kártyákból.
3. Az átismétlés sorrendje: rövidebb sikeres sorozat elöl,
   alacsonyabb könnyűség elöl, rövidebb intervallum elöl,
   azonos tudásszintnél véletlen sorrend a változatosságért.

Az átismétlő kör felismerhető: minden eleme jövőbeli.
Ilyenkor a gyakorló tudja, hogy ez csak frissítés, nem új tanulás.

## 4. Menetvezérlés a felületen

A `WordPractice.svelte` állapotai:

- `queue`: az aktuális sor
- `idx`: hol tartasz a sorban
- `revealed`: fel van-e fedve a hátlap
- `outcomes`: kártya azonosítóhoz rendelt siker vagy hiba az adott körben
- `sessionProgress`: a kör közben frissülő SM-2 állapotok
- `repeats`: kártyánkénti visszapörgetés számláló

A hibás szó legfeljebb kétszer tér vissza ugyanabban a körben,
legalább 7 kártyával később. Az eredményben egyszer számít:
az `outcomes` az első választ jegyzi, az ismétlés csak gyakorlás.

A kör végén az összegzés így szól:

- `{reviewed} szót gyakoroltál, {known} helyes.`
- Ha van hiba: `{missed} szó még gyakorlást igényel.`
- Alatta: `Bármikor indíthatsz új gyakorlókört.`
- Gombok: `A nehezebb szavak újra` csak hiba esetén,
  mellette az `Új gyakorlókör`.

Az `Új gyakorlókör` a még nem látott kártyákból folytatja,
ha van ilyen. Ha mindent láttál, új napi sor indul.
A `A nehezebb szavak újra` csak a hibás szavakat veszi elő újra,
teljes sorrendben.

A válaszok mentése nem azonnali egyenként.
A `CardReviewSession` gyűjti a jeleket, és kötegelve küldi.
Oldalváltáskor és a gyakorló bezárásakor a rendszer megpróbálja kiüríteni.
Hiba esetén újrapróbálás gomb jelenik meg.

## 5. Egyedi csomag és összesített gyakorlás

A két belépési pont szándékosan tér el:

- Egyedi csomag adatlapja (`kartyak/[id]`): `includeAll` módban indul.
  Itt azonnal az összes kártya jön, nem csak az esedékes.
  Ennek oka a felhasználói elvárás: ha belépsz egy normál szókártyába
  és elindítod, a teljes csomagot szeretnéd átvenni.
- Nyelvi összesített oldal (`szavak/[subjectId]`): napi SM-2 módban indul.
  Itt csak az esedékes és új szavak jönnek, csomagonkénti nyugodt sorrendben.
  Ha nincs esedékes, rövid átismétlő kör indul a legbizonytalanabb szavakból.

A felcserélt előlap és hátlap csomagonként megjegyzésre kerül,
így a következő gyakorlás ugyanazzal a beállítással indul.

## 6. Főoldali szakasz és beállítások

A főoldal az `/api/sm2-due` összesítésből mutatja nyelvenként:

- hány szó ismétlésre esedékes
- hány új szó vár
- hány csomag tartozik a nyelvhez

A Beállítások Tanulás paneljén:

- ki és be kapcsolható a főoldali Szavak gyakorlása szakasz,
- nyelvenként külön látható vagy elrejthető az adott nyelv sora.

Kikapcsolt szakasz esetén a főoldal sem betöltési, sem hibaállapotot
nem mutat a szavaknál, és a napi kiemelt kártya sem ajánl szógyakorlást.

## 7. Összesítések és szövegek

A `summarizeSM2()` egy csomaghoz megadja:

- `due`: esedékes és új szavak száma
- `isNew`: még sosem látott szavak száma
- `future`: jövőbeli szavak száma
- `total`: egyedi kártyák száma
- `learned`: `known >= 2` kártyák száma
- `nextDueDay`: legközelebbi jövőbeli esedékesség

A `nextReviewText()` és a `formatDueDay()` ebből képez emberi szöveget,
például `ma esedékes`, `holnap esedékes` vagy `3 nap múlva esedékes`.

## 8. Tudatos egyszerűsítések

- Nincs véletlen keverés a napi sorban. A stabil sorrend nyugodtabb,
  és ismétléskor ugyanazt adja.
- Nincs 5 fokozatú önértékelés. A Tudom vagy Nem tudom gyorsabb,
  mobilon egy kézzel is kezelhető.
- Az ismétlés nem büntet, hanem segít. A hibás szó pár kártyával később
  újra jön, de az összegzésben csak egyszer számít.
- A jövőbeli szavak alapból nem tolakodnak előre.
  Kivétel az egyedi csomagos gyakorlás, ahol a teljes lista a kérés.

---
name: okosurlap-tudasbazis
description: OKOSurlap Tudasbazis cikkek, video forgatokonyvek es egyseges hangnem generalasahoz. Hasznald OKOSurlap, tudasbazis, tudastar, elso lepesek, 2p 5p 8p 13p oktato video, cikk sablon, emberi stilus, nem AI hangu szoveg eseten.
metadata:
  version: '1.0'
  product: OKOSűrlap
  brand_unit: Tudásbázis
---

# OKOSűrlap Tudásbázis

OKOSűrlap súgószöveget, cikket és oktatóvideó-forgatókönyvet ezzel a skilllel írj. A hang komoly és pontos, de emberi. Nem magáz. Nem poénkodik. Nem hangzik sablon-AI szövegnek.

Márkanév a kimenetben mindig **OKOSűrlap**. A felület neve **Tudásbázis**. Ne keverd Tudástárral, Akadémiával, Kisokossal.

## Mikor melyik formátum

| Kérés                               | Formátum     | Olvasd el                                     |
| ----------------------------------- | ------------ | --------------------------------------------- |
| súgócikk, how-to, hiba, beállítás   | cikk         | `references/cikk.md`, `references/stilus.md`  |
| 2 / 5 / 8 / 13 perces videó         | forgatókönyv | `references/video.md`, `references/stilus.md` |
| főoldal, kategória, sorozatbevezető | keretszöveg  | `references/cikk.md` nyitószabályai           |
| stílusvita, átírás, ne legyen AI-s  | csak hangnem | `references/stilus.md`                        |

Sablonok másoláshoz `assets/` alatt vannak. A kész cikket vagy forgatókönyvet a sablon mezőire írd, ne találj ki új dokumentumtípust.

## Kötelező hang

1. Tegezz. Felszólító mód a lépéseknél (nyisd meg, válaszd ki, mentsd el).
2. Egy cikk vagy egy videó = egy feladat. Ha két feladat van, bontsd ketté.
3. Cím = a kész eredmény. Nem hangulat, nem ígéret.
4. Cikkben nincs üdvözöllek, nincs ebben a részben mutatom be.
5. Videóban max egy rövid belépő, aztán munka. Lásd `references/video.md`.
6. Ne adj el. Ne dicsérd a terméket a súgóban.
7. Konkrét UI-szöveg, menü, gomb, mező. Ha nem tudod a pontos feliratot, jelezd `[FELIRAT?]` és ne találj ki hangzatos nevet.
8. Magyaros, beszélt írás. Kerüld a hivatali körmondatot és a marketinget.

A tiltott fordulatok és az emberi ritmus részlete `references/stilus.md`. Minden generálás előtt olvasd el. Ha a szöveg átmenne egy ez ChatGPT teszten, írd újra.

## Generálási sorrend

1. Állapítsd meg a típust (cikk / 2p / 5p / 8p / 13p).
2. Írd ki a célt egy mondatban a felhasználó nyelvén (az első űrlapod elmentve megvan).
3. Gyűjtsd a lépéseket. Hagyd el, ami nem kell a célhoz.
4. Válaszd a sablont `assets/`-ból.
5. Írj. Utána futtasd a stílusellenőrzőt `references/stilus.md` végén.
6. Cikkhez adj 3–7 pontos címet és egy 1–2 mondatos leadet.
7. Videónál írd ki a percbeosztást. A beszéd és a csendes kattintás együtt kiadja a céidőt. Ne töltsd ki vattával.

Ha a felhasználó nem adja meg a videó hosszát, kérdezz rá. Ne tippelj. Ha cikket kér, ne írj forgatókönyvet.

## Címkonvenció

Helyes:

- Első űrlap létrehozása
- Mező hozzáadása az űrlaphoz
- Kitöltött adat exportálása
- Feltételes mező beállítása

Helytelen:

- Kezdjük okosan!
- Minden, amit az űrlapokról tudni érdemes
- Az OKOSűrlap ereje
- Útmutató az Első lépésekhez – 1. rész

URL-slug ha kell `elso-urlap-letrehozasa` formában, ékezet nélkül, kötőjellel.

## Videóidők — ne keverd

Csak ez a négy hossz létezik a sorozatban:

- **2p** egy mikroművelet
- **5p** egy teljes, egyszerű feladat
- **8p** feladat plusz egy elágazás vagy egy tipikus hiba
- **13p** végigvitt folyamat, 2–3 eset, rövid hibaelhárítás

A percek nem körülbelül tizenhárom. Ha 13 perces a kérés, a forgatókönyv 12–13 perc legyen, ne 9 és ne 16.

## Hiányzó termékismeret

Az OKOSűrlap pontos menüit ez a skill nem találja ki. Ha a felhasználó nem ad felületi nevet, gombot, útvonalat:

- kérdezz, vagy
- írj `[FELIRAT?]` / `[ÚTVONAL?]` jelölést a szövegbe,
- ne helyettesítsd kitalált angol SaaS-zsargonnal.

Ha a felhasználó ad képernyőképet, menülistát vagy régi cikket, abból vedd a szavakat. A termék nyelvét másold, ne szépítsd.

## Kimenet

Alapból magyar. A kész anyagot úgy add oda, hogy azonnal bemásolható legyen a Tudásbázisba vagy a teleprompterbe.

Cikk kimenet sorrendje:

1. Cím
2. Lead (1–2 mondat)
3. Törzs
4. Opcionális Ha elakadtál (max 3 pont, csak valódi hibák)

Videó kimenet sorrendje:

1. Cím plusz hossz
2. Egy mondatos cél
3. Időzített jelenetek
4. Kimondandó szöveg
5. Képernyőn látható teendő
6. Alsó harmad / kártyaszöveg, ha kell, külön, röviden

Ne írj README-t a kimenet köré. Ne magyarázd a skillt a felhasználónak, hacsak nem azt kérte.

# Vizuális leckeszerkesztő

A leckék bekezdései közvetlenül az oldalon szerkeszthetők. A cím és a tartalommező mindig látszik, az inaktív tartalom legfeljebb négy sor magas. Kezdetben az első bekezdés aktív, és amíg van bekezdés, mindig egy nyitva marad. Bekezdésváltáskor a kattintott mező helye megmarad, a tartalom finoman feltárul, az eszköztár rövid áttűnéssel és becsúszással jelenik meg. Az aktív mezőt világosabb szürke keret jelzi. Az új bekezdés egy kattintással hozzáadható, utána rögtön gépelhető. Külön előnézet nincs. A bekezdések megtartják a saját visszavonási előzményeiket. Az Enter és a Shift+Enter ugyanúgy működik, a szövegsorok között nincs automatikus bekezdéstérköz. Üres sorhoz kétszer kell Entert nyomni.

Az első változat szövegformázást, alcímeket, listákat, hivatkozásokat, idézetet, kódot, elválasztót, képet, képletet, egyszerű táblázatot, Fontos/Példa/Tipp dobozt és lenyitható tartalmat tartalmaz. A képek URL-ről vagy feltöltéssel adhatók hozzá, leírással, képaláírással és fél vagy teljes szélességgel. A képletbevitel MathLive segítségével történik, saját sablongombokkal, szimbólumpanellel, kurzormozgatással és opcionális LaTeX-forrással. Az olvasó KaTeX-szel jeleníti meg őket. A táblázat beszúrása kis panelen történik. A szerkesztési menü a kijelölt cellához igazodik, mutatja annak sorát és oszlopát, a műveleteket pedig külön sor- és oszlopcsoportba rendezi, rövid feliratokkal és magyarázó súgókkal. Az eszköztár menüi megőrzik a kijelölést és a kurzor láthatóságát, az aktív formázások kiemelést kapnak. Mobilon az aktív bekezdés eszköztára görgetés közben a képernyő tetején marad.

## Mentés és kompatibilitás

- A Mentés gomb ment a szerverre. A helyi IndexedDB-piszkozat automatikus, felhasználóhoz és leckéhez kötött, és újranyitáskor visszaállítható vagy elvethető.
- Az elsődleges formátum a `lessons.content_json` verziózott, ellenőrzött dokumentuma. A `body_md` olvasható Markdown-változatként továbbra is megmarad.
- A régi Markdown-leckék módosítás nélkül olvashatók. A szerkesztő AST alapján importálja a tartalmukat; az ismeretlen elemek szövegként megmaradnak. Pusztán megnyitás vagy átnevezés nem alakítja át a régi tartalmat.
- A bekezdések stabil `slug` értéke megmarad átnevezés és átrendezés után, így a hozzájuk rendelt kvízkérdések kapcsolata is megmarad.
- A `content_revision` összehasonlítása megakadályozza, hogy egy korábbi szerkesztőablak vagy piszkozat felülírjon egy újabb mentést. Ütközéskor a helyi munka megmarad.

## Adatbázis és R2

A kiadás előtt alkalmazni kell a `0006_lesson_content.sql` migrációt. A helyi adatbázisra a fejlesztés során alkalmazva lett. Az éles migráció és telepítés külön művelet:

```sh
pnpm exec wrangler d1 migrations apply leardy-fop-db --local
pnpm exec wrangler d1 migrations apply leardy-fop-db --remote
```

A képfeltöltés a meglévő `UPLOADS` R2-bindingot használja, `lesson-images/` kulcselőtaggal. A helyi Cloudflare-környezet ugyanennek a bindingnak a helyi R2-tárolóját használja. A feltöltés bejelentkezést, leckeszerkesztési jogosultságot és azonos eredetű kérést igényel; legfeljebb 10 MB-os JPEG, PNG, WebP, GIF vagy AVIF fogadható el. A MIME-típust a szerver a fájl tartalmából ellenőrzi.

A saját lecke- és kvízképeket megnyitáskor a service worker gyorsítótárazza, a meglévő 300 bejegyzéses, 50 MB-os kereten belül. A már gyorsítótárazott képek offline olvashatók. Külső URL-ek offline elérhetősége a külső szolgáltatótól függ. A matematikai betűkészletek helyiek.

## Ellenőrzés

```sh
pnpm check
pnpm build
node --test scripts/test-lesson-content.mjs scripts/test-curriculum-editor.mjs scripts/test-question-images.mjs scripts/test-content-cache.mjs scripts/test-pwa-lifecycle.mjs
LEARDY_TEST_LOCAL_R2=1 node --test scripts/test-question-images.mjs
```

A böngészős tesztek a valódi Svelte-komponenseket használják, tesztadatokkal és HTTP-válaszokkal. A normál Vite fejlesztői szerver mellett, külön Playwriter-munkamenetben futtathatók. Egy másik futó Vite szerver mellett külön `cacheDir` szükséges, hogy a függőségoptimalizálás ne keveredjen.

```sh
playwriter -s <munkamenet> -e 'state.lessonOrigin="http://127.0.0.1:5173"'
playwriter -s <munkamenet> -f scripts/test-lesson-editor-browser.mjs --timeout 60000
playwriter -s <munkamenet> -f scripts/test-lesson-editor-extras-browser.mjs --timeout 60000
playwriter -s <munkamenet> -f scripts/test-lesson-editor-compact-browser.mjs --timeout 60000
playwriter -s <munkamenet> -f scripts/test-lesson-editor-controls-browser.mjs --timeout 60000
```

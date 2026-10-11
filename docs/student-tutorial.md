# Interaktív diákútmutató

Az útmutató a valódi oldalakon emeli ki a kezelőfelületeket. Az első bejelentkezéskor felajánlja az Első lépések bejárást a diákoknak, a már meglévő fiókoknak is. A tanárok és az adminisztrátorok nem kapnak automatikus felajánlást. A Beállítások alján található Útmutató sorból az alapbejárás és a Tanulás, Tanterem, Kártyák fejezetek bármikor indíthatók, folytathatók vagy újrakezdhetők.

## Működés és mentés

- A lépéseket, szövegeket és útvonalakat a `src/lib/tutorial/definition.ts` definiálja.
- A layout saját `TutorialController` példányt ad át Svelte contextben. A vezérlő kezeli a lépéseket, az oldalanként regisztrált adaptereket és a mentési sort.
- A `Tutorial.svelte` a bodyba helyezett kiemelést és magyarázatot rajzolja. Kattintást csak az adott lépés megengedett célpontján enged. A kvízindítás, csatlakozás és csomagmentés helyét megmutatja, de ezeket a műveleteket nem hajtja végre.
- A `GET /api/tutorial` és `PATCH /api/tutorial` kizárólag a bejelentkezett felhasználó saját állapotát kezeli. A `tutorial_progress` tábla fiókonként és fejezetenként tárolja a haladást.
- A revízió megakadályozza másik eszköz újabb mentésének felülírását. Azonos művelet ismételt elküldése nem hoz létre újabb módosítást.
- A helyi állapot és a függő mentések a `leardy-tutorial:<userId>` kulcson maradnak meg. Hálózati visszakapcsolódáskor a vezérlő szinkronizál. Újratöltés után a bejárás kézzel folytatható.
- A kihagyott vagy befejezett bejárást verzióváltás sem ajánlja fel automatikusan újra. Fiókváltáskor az aktív bejárás bezárul; fióktörléskor a szerverállapot és az adott böngésző helyi állapota törlődik.
- Hiányzó választható tartalom esetén a bejárás továbblép. Kötelező célpont hibájánál újrapróbálás és kihagyás választható. A szerverállapot sikertelen lekérése nem számít első látogatásnak.

## Bővítés

1. Adj stabil azonosítót és `data-tutorial` jelölést a tényleges gombhoz vagy tartalomelemhez. Közös UI-komponensnél a `tutorialId` prop továbbítja a jelölést.
2. Vedd fel a lépést a megfelelő fejezetbe. Az `event` nélküli lépés tájékoztat, a `navigation` valódi oldalváltást vár. Más eseményhez a művelet sikeres megnyitása után hívd a `tutorial.signal(...)` metódust.
3. Dinamikus hivatkozásnál add át a tartalom azonosítóját `data-tutorial-content-id` attribútummal. Az útvonalat a `tourPath` állítja össze.
4. Ha panelt kell nyitni vagy a nézetet előkészíteni, regisztrálj oldalszintű adaptert. A `prepare` legyen ismételhető, a `close` zárja be az útmutató által megnyitott paneleket. A tananyagválasztás továbbra is a közös `ContentPicker` feladata.
5. Ellenőrizd az üres listát, a hiányzó tartalmat és a visszalépést is. A böngészős teszt elutasít minden tanulmányi eredményt vagy tartalmat módosító kérést.

## Adatbázis és ellenőrzés

A kiadás előtt alkalmazni kell a `0007_student_tutorial.sql` migrációt a célkörnyezet adatbázisára. A migráció hiányában az útmutató API 503 választ ad, és nem jelenik meg téves első belépési felajánlás.

```sh
pnpm exec wrangler d1 migrations apply leardy-fop-db --local
# Az éles kiadás részeként:
pnpm exec wrangler d1 migrations apply leardy-fop-db --remote

pnpm check
pnpm build
node --experimental-strip-types --test scripts/test-tutorial.mjs scripts/test-offline-session.mjs scripts/test-back-navigation.mjs scripts/test-offline-learning.mjs scripts/test-home-activity.mjs
```

A böngészős teszt saját Playwriter-munkamenetben, futó Vite fejlesztői szerverrel használható. A komponensek és az útvonalváltások valódiak, az API-válaszok elkülönített tesztadatokat adnak. Alapesetben a szerver címe `http://127.0.0.1:5196`, ez a `state.tutorialOrigin` változóval átállítható.

```sh
playwriter -s <munkamenet> -e 'state.tutorialOrigin="http://127.0.0.1:5196"'
playwriter -s <munkamenet> -f scripts/test-tutorial-browser.mjs --timeout 180000
```

A teszt lefedi mind a négy bejárást, a mobilos és asztali nézetet, a kis sötét képernyőt, a billentyűzetet, a fiókváltást, a böngésző vissza gombját, a folytatást új böngészőkörnyezetben, az offline mentést, a mentési ütközést és az üres vagy hibás tartalmakat.

A mobilos bejárás a magyarázatnak külön helyet tart fenn a választó fölött, és megvárja a Drawer, valamint a listák animációjának végét. A tantárgyválasztó útmutatólépése külön megadható, ezért egy korábbi mentett választás vagy visszalépés nem viszi másik listára a bejárást. A kék kiemelés a görgethető területre van vágva. A lépésváltási és kiemelési animációk figyelembe veszik a rendszer és az alkalmazás csökkentett mozgási beállítását. A böngészős teszt alapból bekapcsolt animációkkal és mobilon érintéses környezetben fut, több tantárggyal és mentett választással is ellenőrzi a negyedik lépést.

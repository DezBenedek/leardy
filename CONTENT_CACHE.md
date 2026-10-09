# Tananyagcache és offline tanulás

A böngésző az elmentett adatot azonnal megjeleníti, majd megnyitáskor, választónyitáskor, visszatéréskor és újracsatlakozáskor ellenőrzi a szervert. Nincs időzített lekérdezés. Változáskor a worker minden megnyitott ablaknak üzen; a Query és a ContentPicker átveszi az új adatot. A folyamatban lévő kvíz az induláskor kapott kérdésekkel fejeződik be.

## Tárolás

- D1-triggerek verziózzák a katalógust és az érintett tantárgyakat, beleértve a törlést, áthelyezést és a közzététel visszavonását.
- A Cloudflare Cache API csak nyilvános, verziózott tananyagot tárol. A szerver az aktuális verziót minden kérésnél D1-ből ellenőrzi; a személyes haladást külön illeszti hozzá.
- Az ETag a tartalom és a személyes állapot változását is jelzi. A változatlan válasz 304; a HTTP-cache minden alkalommal ellenőriz.
- A service worker a nyilvános adatot közösen, a személyes választ fiókonként külön tárolja. A kliens által küldött fiókazonosító nem jogosultság: a szerver munkamenete dönti el a válasz tulajdonosát.
- A tartalomcache összesen legfeljebb 300 bejegyzés és 50 MiB. Tárhelyhibánál az élő hálózati válasz továbbra is használható. A statikus alkalmazásfájlok külön cache-ben vannak.
- A 404/410 és a jogosultság elvesztése eltávolítja az érintett másolatot; hálózati hiba vagy 5xx megtartja azt. A teljes tantárgyfa a megszűnt offline leckéket is eltávolítja. A korábbi lekérdezések érvénytelenítés után nem írhatják vissza a régi adatot.
- A korábbi `leardy:q:*`, `leardy-library` és `leardy-api-v1` másolatokat kivezetjük. A könyvtár külön fallbackje fiókhoz kötött és lejár. Kilépéskor a személyes cache törlődik.
- A régi hálózati válasz eldobása nem küld újabb lekérést kiváltó érvénytelenítést. A 304-es válasz a tárolt változat verzióját és tulajdonosát igazolja akkor is, ha a CDN elhagyja az egyedi fejléceket.
- A statikus precache egyszerre legfeljebb hat fájlt tölt le. Az előző kiadás statikus fájljai megmaradnak a nyitott alkalmazás számára; korábbi cache-ből kizárólag tartalomazonosítós kódfájl olvasható vissza.
- A PWA natív regisztrációt használ automatikus oldal-újratöltés nélkül. Az ébresztési frissítés legfeljebb percenként ellenőrzi a workerkiadást, az egymást követő láthatósági események egy tananyag-ellenőrzéssé vonódnak össze. Nincs időzített lekérdezés.

## Offline eredmények

A Tanulás oldal és a leckeoldal a saját URL-jén működik internet nélkül is. A `/tanulas` előre generált, személyes adat nélküli alkalmazásvázát a worker újratöltéskor a lecke URL-jén is kiszolgálja. A két útvonal nem igényel szerveres oldaladatot; a munkamenet ellenőrzése univerzális layout-betöltésben történik. Offline induláskor a korábbi fiókazonosító megmarad, és nem jelentkeztetjük ki a felhasználót.

Az offline tantárgy-, tananyag- és témakörlista kizárólag a tartósan tárolt leckedokumentumokból épül. A teljes katalógusban szereplő, de még meg nem nyitott lecke nem kerül bele. A tárolt tantárgyfa csak a sorrendet, az ikonokat és a jelenlegi fiók teljesítési állapotát egészíti ki; nélküle is helyreáll a hierarchia. A globális ContentPicker helyi adatforrást kap. A keresés, a teljesítési szűrő, a rendezés és a Folytatás gomb helyben működik. Kapcsolatváltáskor az oldal a megfelelő adatkészletre vált.

A kvízeredmény IndexedDB-ben, fiókazonosítóval, egyedi eseményazonosítóval, kérdéssorverzióval és a kitöltés idejével marad meg. A helyben várakozó eredmények a teljesítési szűrőben is látszanak. A tárolás a böngésző rendelkezésre álló tárhelyétől függ; a cache törlése után a leckéket újra meg kell nyitni online.

Visszacsatlakozáskor a kliens előbb ellenőrzi a bejelentkezett fiókot, majd sorrendben küldi az eredményeket. Átmeneti hibánál növekvő késleltetéssel próbálkozik újra. A D1-nyugta, a haladás és az aktivitási nap egy tranzakció: az ismételt küldés nem dupláz, a régebbi eredmény nem írja felül az újabbat. Az aktivitási nap a kitöltés budapesti dátuma. Megváltozott kérdéssor vagy törölt lecke esetén az eredmény helyben megmarad, és új kitöltést kérünk.

## Kiadás

Előbb a `0003_content_cache.sql` migrációt kell alkalmazni (`pnpm run db:migrate`), utána az alkalmazást kiadni (`pnpm run deploy`). A migráció nélkül az új végpontok nem működnek. A service worker csak a teljes statikus precache sikeres letöltése után aktiválódik.

Ellenőrzések:

```sh
pnpm check
pnpm build
node --test scripts/test-content-cache.mjs scripts/test-pwa-lifecycle.mjs scripts/test-offline-learning.mjs scripts/test-query-reactivity.mjs scripts/test-home-activity.mjs scripts/test-curriculum-editor.mjs scripts/test-sm2.mjs scripts/test-back-navigation.mjs
```

Böngészős próba: lecke megnyitása online, hálózat kikapcsolása, újratöltés, kvíz kitöltése, újratöltés, majd visszacsatlakozás. Az eredménynek meg kell maradnia, és egyszer szinkronizálódnia. Másik ablakban végzett módosítás vagy törlés után a nyitott listának, választónak és olvasónak át kell vennie a változást. A nyitott kvíz kérdései a kitöltés alatt nem változhatnak meg.

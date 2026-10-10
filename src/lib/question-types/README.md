A feladattípusok saját mappában élnek: `choice`, `true-false`, `text`, `gap`, `match`, `order`, `map`.

- `definition.ts`: alapértékek, betöltés, mentési alak, ellenőrzés, válaszkeverés és kiértékelés. Böngésző és szerver is ezt használja.
- `Editor.svelte`: az adott típus szerkesztőmezői és azok működése.
- `Game.svelte`: kitöltés, belső állapot és visszajelzés.

A `registry.ts` az adatlogikát, a `components.ts` a szerkesztőket, játékokat és ikonokat regisztrálja. A `QuestionForm` és a `QuizRunner` csak a közös keretet kezeli.

A megjelenítési sorrend futamonként egyszer készül el. A párosítás mindkét oszlopa külön keverést kap; a `leftOrder` az eredeti párindexeket őrzi, ezért a beküldött válaszok és a kiértékelés sorrendje változatlan.

A párosítás vonalai a tényleges gombok adatazonosítóihoz kötődnek. Méretváltozás és DOM-átrendezés után újramérjük a végpontokat, helyi SVG-koordinátákban.

A `choice` egyetlen típusként kezeli az egy és több helyes választ. A `settings.multiple` kapcsoló esetén a helyes válasz JSON-tömb; az ellenőrzés sorrendtől független, pontos halmazegyezést vár. A régi, szöveges helyes válaszok változatlanul működnek.

A `gap` és `map` közös `FillSettings`, `FillGame` és `AnswerSlot` komponenseket használ. A mód `drag`, `text` vagy `dropdown`. Behúzáskor az egyes szópéldányok külön azonosítót kapnak, ezért az ismétlődő, egyszer használható szavak is elhelyezhetők. A `reusable` kapcsoló megtartja a szavakat a listában. Egérrel és érintéssel húzhatók, koppintással vagy billentyűzettel is hozzárendelhetők.

A hiányos szövegben a `[[helyes válasz]]` jelöli a mezőket. A szerkesztő kijelölt szöveget is hiánnyá alakíthat. A tanulói játék a hiányok tartalmát nem kapja meg, csak a mezők helyét és választásos módban a kevert szólistát.

A vaktérkép `settings.boxes` mezői stabil azonosítót, százalékos középpontot és szélességet, helyes választ és opcionális nyílpontot tárolnak. A kép az eddigi képfeltöltést használja. A `Canvas` a kép tényleges megjelenített mérete alapján a mező széléhez számolja a nyíl végét, átméretezéskor is. A játékra előkészített mezőkben nem szerepel helyes válasz.

A `settings` az `options_json` objektumában tárolódik, a meglévő tömbös és páros formátum továbbra is olvasható. A közös `settings.ts` olvasó a szerveren is ellenőrzi a módokat, koordinátákat és méretkorlátokat. A beállítások a leckében, másolatban, előnézetben és saját sablonban is megmaradnak.

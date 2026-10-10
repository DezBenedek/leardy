A feladattípusok saját mappában élnek: `choice`, `true-false`, `text`, `match`, `order`.

- `definition.ts`: alapértékek, betöltés, mentési alak, ellenőrzés, válaszkeverés és kiértékelés. Böngésző és szerver is ezt használja.
- `Editor.svelte`: az adott típus szerkesztőmezői és azok működése.
- `Game.svelte`: kitöltés, belső állapot és visszajelzés.

A `registry.ts` az adatlogikát, a `components.ts` a szerkesztőket, játékokat és ikonokat regisztrálja. A `QuestionForm` és a `QuizRunner` csak a közös keretet kezeli.

A megjelenítési sorrend futamonként egyszer készül el. A párosítás mindkét oszlopa külön keverést kap; a `leftOrder` az eredeti párindexeket őrzi, ezért a beküldött válaszok és a kiértékelés sorrendje változatlan.

A párosítás vonalai a tényleges gombok adatazonosítóihoz kötődnek. Méretváltozás és DOM-átrendezés után újramérjük a végpontokat, helyi SVG-koordinátákban.

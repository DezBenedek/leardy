# Lecke importálása JSON-ból

A leckeszerkesztő **Lecke műveletei** menüjében az **Importálás JSON-ból** ponttal egy JSON-szövegből vagy `.json` fájlból tölthetsz be tartalmat a leckébe. A JSON háromféle részt tartalmazhat, ezek egymástól függetlenül is használhatók:

- `sections`: bekezdések Markdown-szöveggel,
- `decks`: kártyacsomagok előlap-hátlap párokkal,
- `quiz`: kvízkérdések.

```json
{
  "title": "Az erdő állatai",
  "sections": [
    { "title": "Bevezetés", "body": "Az **erdőben** sok állat él.\n\n- róka\n- nyúl" }
  ],
  "decks": [
    { "title": "Állatok", "cards": [{ "front": "róka", "back": "fox" }] }
  ],
  "quiz": [
    { "type": "choice", "question": "Melyik erdei állat?", "options": ["róka", "cápa"], "answer": "róka" }
  ]
}
```

## Mi történik betöltéskor

- A **bekezdések** a szerkesztő végére kerülnek, és a **Mentés** gombbal véglegesítheted őket. A `title` megadásakor a lecke címe is átíródik (kikapcsolható).
- A **kvízkérdések** és a **kártyacsomagok** azonnal mentődnek a szerverre. A kvíz a lecke meglévő kérdései mellé kerül, a csomagok új leckecsomagként jönnek létre.

Hiba esetén az első problémát magyar üzenet mutatja sorszámmal, például `3. kérdés: az options tömb kötelező`. Ilyenkor semmi sem töltődik be, a JSON-t javítva újra próbálhatod.

## Korlátok

- A JSON legfeljebb 2 MB lehet.
- Bekezdés: legfeljebb 100 darab, cím legfeljebb 160 karakter, szöveg legfeljebb 100 000 karakter. A `body` helyett `markdown` kulcs is használható.
- Csomag: legfeljebb 10 darab, csomagnév legfeljebb 76 karakter, kártyaoldalanként legfeljebb 5000 karakter. Egy csomagban legfeljebb 200 kártya lehet: a hosszabb lista automatikusan `(2)`, `(3)` sorszámú folytatáscsomagokra bomlik. Egy csomagban legfeljebb 2000 kártya adható meg.
- Kvíz: legfeljebb 200 kérdés. A vaktérkép (`map`) nem tölthető be, mert a képmezőket a szerkesztőben kell elhelyezni.

## Kérdéstípusok

A `type` az alábbiak egyike lehet (`true-false` alias elfogadott `tf` helyett):

| `type` | Kötelező mezők | Megjegyzés |
|---|---|---|
| `choice` | `question`, `options` (2-8), `answer` | Az `answer` szöveg egy helyes válasznál, tömb több helyes válasznál |
| `tf` | `question`, `answer` | Az `answer` csak `Igaz` vagy `Hamis` lehet |
| `text` | `question`, `answer` | Szabadszavas válasz, legfeljebb 200 karakter |
| `match` | `question`, `pairs` (2-8) | Párok: `{ "left": "…", "right": "…" }`, a jobb oldalak nem ismétlődhetnek |
| `order` | `question`, `options` (2-8) | Az `options` a helyes sorrendet adja meg |
| `gap` | `question`, `text` | A hiányzó részeket `[[szó]]` jelöli; a `words` tömb adja a válaszbankot |

Minden típusnál adható meg opcionális `image` kép-URL.

```json
{
  "quiz": [
    { "type": "choice", "question": "Melyek emlősök?", "options": ["róka", "cápa", "nyúl"], "answer": ["róka", "nyúl"] },
    { "type": "tf", "question": "A róka emlős.", "answer": "Igaz" },
    { "type": "text", "question": "Mi a róka angolul?", "answer": "fox" },
    { "type": "match", "question": "Párosítsd az állatot az angol nevével!", "pairs": [{ "left": "róka", "right": "fox" }, { "left": "nyúl", "right": "rabbit" }] },
    { "type": "order", "question": "Tedd sorrendbe a fejlődést!", "options": ["mag", "csíra", "fa"] },
    { "type": "gap", "question": "Egészítsd ki a mondatot!", "text": "A [[róka]] átugorja a [[kutyát]].", "words": ["róka", "kutyát", "macska"] }
  ]
}
```

## Ellenőrzés

```sh
node --test scripts/test-lesson-json-import.mjs
```

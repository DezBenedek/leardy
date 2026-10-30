# Leardy Publikus API (v1)

Tanári fiókkal használható, tanulás és kártyák kezelésére.
Minden végpont a kulcs tulajdonosának nevében jár el (saját csomagok, szerkeszthető tananyag, saját haladás).

## Hitelesítés

Kulcs létrehozása: Beállítások, Fejlesztői beállítások (csak tanári fiókkal).

Használat háromféleképpen:

```bash
curl -H "Authorization: Bearer ld_..." https://leardy.dezso.hu/api/v1/me
curl -H "X-Api-Key: ld_..." https://leardy.dezso.hu/api/v1/subjects
curl "https://leardy.dezso.hu/api/v1/subjects?api_key=ld_..."
```

Hiba kulcs nélkül: `401 { "error": "..." }`.
Nem tanári kulcs: `403`.

## Alapok

- Alap: `/api/v1`
- Minden válasz JSON, `Cache-Control: no-store`.
- CORS: `*` (böngészőből is hívható).
- Tárgylista: `GET /api/v1/` (endpoint-lista), `GET /api/v1/openapi.json` (OpenAPI váz).
- Rate limit most nincs, de a `limit` maximum 200 (kártyáknál 1000), a kártyamentés tételenként max 500.

## Fiók

- `GET /api/v1/me` - saját fiók, kulcsazonosító, jogosultság.

## Tanulás: olvasás

- `GET /api/v1/subjects` - tantárgyak.
- `GET /api/v1/subjects/:id?include=tree` - tantárgy szintekkel, témakörökkel, leckékkel.
- `GET /api/v1/levels?subjectId=` - szintek.
- `GET /api/v1/levels/:id` - egy szint.
- `GET /api/v1/materials?levelId=` - témakörök.
- `GET /api/v1/materials/:id` - egy témakör.
- `GET /api/v1/lessons?materialId=&subjectId=&search=&limit=&offset=` - leckék.
- `GET /api/v1/lessons/:id?include=quizzes,cards,all` - lecke szöveggel, kvízekkel, kártyákkal.
- `GET /api/v1/quizzes?lessonId=` vagy `?subjectId=` - kvízek.
- `GET /api/v1/quizzes/:id` - kvíz kérdésekkel.
- `GET /api/v1/quiz-questions?quizId=` - kérdések.
- `GET /api/v1/search?q=&subjectId=` - keresés leckékben és saját csomagokban.

## Tanulás: szerkesztés (tananyag-szerkesztői jog kell)

A hivatalos tananyag írása ugyanazt a jogosultságot kéri, mint a webes szerkesztő: admin, tulajdonos vagy felvett szerkesztő az adott szinten.

- `POST /api/v1/lessons` `{ materialId, title, bodyMd?, sort? }`
- `PATCH /api/v1/lessons/:id` `{ title?, bodyMd?, materialId?, sort? }`
- `DELETE /api/v1/lessons/:id`
- `POST /api/v1/quizzes` `{ lessonId, title, sectionSlug?, sort? }`
- `PATCH /api/v1/quizzes/:id`, `DELETE /api/v1/quizzes/:id`
- `POST /api/v1/quiz-questions` `{ quizId, questionText, type?, options?, pairs?, correctAnswer?, sectionSlug?, sort? }`
  - `type`: `choice`, `true-false`, `text`, `gap`, `match`, `order`, `map`.
  - `options`: típustól függő tömb vagy objektum, tárolása a beépített `storedQuestionOptions` szerint.
- `GET/PATCH/DELETE /api/v1/quiz-questions/:id`

Példa kérdésfelvételre:

```bash
curl -X POST https://leardy.dezso.hu/api/v1/quiz-questions \
  -H "Authorization: Bearer ld_..." -H "Content-Type: application/json" \
  -d '{"quizId":"quiz-...","questionText":"Mi Anglia fővárosa?","type":"choice","options":["London","Párizs","Berlin"],"correctAnswer":"London"}'
```

## Hivatalos kártyák (szerkesztői jog kell az íráshoz)

- `GET /api/v1/card-packs?subjectId=&lessonId=&limit=&offset=` - csomagok kártyaszámmal.
- `GET /api/v1/card-packs/:id` - csomag kártyákkal.
- `POST /api/v1/card-packs` `{ lessonId, title, cardKind?, sort?, lessonIds? }`
- `PATCH /api/v1/card-packs/:id`, `DELETE /api/v1/card-packs/:id`
- `GET /api/v1/lesson-cards?lessonId=&packId=` - kártyák (az egyik szűrő kötelező).
- `POST /api/v1/lesson-cards` `{ lessonId, front, back, packId?, sectionSlug? }`
- `GET/PATCH/DELETE /api/v1/lesson-cards/:id`

## Saját csomagok és kártyák

A kulcs tulajdonosának saját csomagjai. Típus automatikus: nyelvi tantárgynál szókártya, máshol tanulókártya.

- `GET /api/v1/decks?subjectId=` - saját csomagok kártyaszámmal.
- `POST /api/v1/decks` `{ title, subjectId?, levelId?, materialId?, lessonId?, lessonIds?, isPublic?, cards? }`
  - `cards`: `[{ front, back }]` max 200 létrehozáskor.
  - `isPublic: true` - publikált tanári csomag: a Felfedezésben és a csatolt leckénél mindenkinek látszik.
- `GET /api/v1/decks/:id` - csomag kártyákkal.
- `GET /api/v1/decks/:id/cards` - csak kártyák.
- `PATCH /api/v1/decks/:id`, `DELETE /api/v1/decks/:id`
- `GET /api/v1/deck-cards?deckId=` - kártyák.
- `POST /api/v1/deck-cards` `{ deckId, front, back, sectionSlug? }`
- `GET/PATCH/DELETE /api/v1/deck-cards/:id`

Példa csomagfeltöltésre:

```bash
curl -X POST https://leardy.dezso.hu/api/v1/decks \
  -H "Authorization: Bearer ld_..." -H "Content-Type: application/json" \
  -d '{"title":"Angol szavak 1","subjectId":"english","cards":[{"front":"apple","back":"alma"}]}'
```

## Haladás és gyakorlás

Mindig a kulcs tulajdonosának haladása.

- `GET /api/v1/progress/lessons?lessonId=` - egy vagy összes leckehaladás.
- `POST /api/v1/progress/lessons` `{ lessonId, done, score?, total? }`
- `GET /api/v1/progress/cards` - teljes SM-2 térkép (max 5000 sor).
- `GET /api/v1/progress/cards/due?deck=&pack=&lesson=` - esedékesség egy csomagra.
  - Válasz: `{ due, fresh, future, today, total }` kártyaazonosítókkal.
- `POST /api/v1/progress/cards/review` `{ results: [{ key, known }] }`
  - `known`: `true` = tudom, `false` = nem tudom. SM-2 szerint ütemez.
- `GET /api/v1/progress/stats` - `{ lessonsDone, cardsTouched, decks, streak, xp }`

Példa gyakorlásra:

```bash
curl "https://leardy.dezso.hu/api/v1/progress/cards/due?deck=deck-... " -H "Authorization: Bearer ld_..."
curl -X POST https://leardy.dezso.hu/api/v1/progress/cards/review \
  -H "Authorization: Bearer ld_..." -H "Content-Type: application/json" \
  -d '{"results":[{"key":"dc-...","known":true}]}'
```

## Könyvtár

- `GET /api/v1/library` - mentett hivatalos csomagok és saját csomagok.
- `POST /api/v1/library` `{ quizId: "pack:..." }` - mentés (`deck:` saját esetén csak visszaigazol, publikált idegen csomag esetén menti).
- `DELETE /api/v1/library` `{ quizId }` - törlés.

## Hibakódok

- `400` érvénytelen kérés vagy hiányzó mező.
- `401` hiányzó vagy rossz kulcs.
- `403` nincs jogosultság (nem tanár, vagy nem szerkesztő az adott szinten).
- `404` nincs ilyen azonosító.
- `500/503` szerver vagy adatbázis hiba.

## Kulcskezelés (web)

- `GET /api/api-keys` - aktív kulcsok (munkamenettel).
- `POST /api/api-keys` `{ name? }` - új kulcs, a `secret` csak egyszer látszik.
- `DELETE /api/api-keys/:id` - visszavonás.

## MCP szerver

A `mcp` mappában MCP szerver fut a fenti API-ra. Modellekből hívható eszközökkel fedi le ugyanazt: tantárgyak, leckék, kvízek, kártyák, haladás, könyvtár. Részletek: `mcp/README.md`. Indítás `LEARDY_API_KEY` környezeti változóval.

# Leardy MCP szerver

MCP eszközök a Leardy publikus API v1-re. Tanulás és kártyák kezelése modellekből: tantárgyak, leckék, kvízek, hivatalos és saját kártyák, haladás, gyakorlás.

## Előfeltétel

- Node.js 20 vagy újabb
- Tanári API kulcs a Leardy Beállítások, Fejlesztői beállítások alatt (`ld_...`)

## Telepítés

```bash
cd mcp
pnpm install
```

## Konfiguráció

Másold le a mintát, majd töltsd ki:

```bash
cp .env.example .env
```

`.env` tartalma:

```bash
LEARDY_BASE_URL=https://leardy.app
LEARDY_API_KEY=ld_ide_jon_a_kulcs
```

Helyi fejlesztéshez:

```bash
LEARDY_BASE_URL=http://localhost:5173
```

## Indítás

```bash
pnpm start
```

Fejlesztéshez figyelő módban:

```bash
pnpm dev
```

Típusellenőrzés:

```bash
pnpm typecheck
```

## Használat OpenCode vagy Claude Desktop alól

Példa MCP konfiguráció:

```json
{
	"mcpServers": {
		"leardy": {
			"command": "pnpm",
			"args": ["--dir", "/teljes/utvonal/leardy/mcp", "start"],
			"env": {
				"LEARDY_BASE_URL": "https://leardy.app",
				"LEARDY_API_KEY": "ld_ide_jon_a_kulcs"
			}
		}
	}
}
```

Alternatíva `tsx` közvetlen hívással:

```json
{
	"mcpServers": {
		"leardy": {
			"command": "npx",
			"args": ["tsx", "/teljes/utvonal/leardy/mcp/src/index.ts"],
			"env": {
				"LEARDY_BASE_URL": "https://leardy.app",
				"LEARDY_API_KEY": "ld_ide_jon_a_kulcs"
			}
		}
	}
}
```

## Eszközök

Olvasás:

- `me`, `list-subjects`, `get-subject`
- `list-levels`, `list-materials`
- `list-lessons`, `get-lesson`, `search`
- `list-quizzes`, `get-quiz`, `list-quiz-questions`
- `list-card-packs`, `get-card-pack`, `list-lesson-cards`
- `list-decks`, `get-deck`, `list-deck-cards`
- `get-lesson-progress`, `get-card-progress`, `get-due-cards`, `get-progress-stats`
- `list-library`

Írás:

- `create-lesson`, `update-lesson`, `delete-lesson`
- `create-quiz`, `update-quiz`, `delete-quiz`
- `create-quiz-question`, `update-quiz-question`, `delete-quiz-question`
- `create-card-pack`, `update-card-pack`, `delete-card-pack`
- `create-lesson-card`, `update-lesson-card`, `delete-lesson-card`
- `create-deck`, `update-deck`, `delete-deck`
- `create-deck-card`, `update-deck-card`, `delete-deck-card`
- `save-lesson-progress`, `review-cards`
- `save-library`, `remove-library`

A hivatalos tananyag írása szerkesztői jogot kér, ugyanazt mint a webes szerkesztő. A saját csomagok és a haladás mindig a kulcs tulajdonosához tartozik.

## Hibakezelés

- Kulcs nélkül minden eszköz érthető hibát ad vissza a `LEARDY_API_KEY` beállításáról.
- API hiba esetén az eszköz `isError` jelzéssel tér vissza a HTTP kóddal és a szerver üzenetével.
- Naplózás `stderr` csatornán történik, az `stdout` a protokollé marad.

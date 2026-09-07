# Leardy (újrakezdve)

Nyelvtanulós PWA: szókártyák, leckéről leckére tanulás, tanterem élő dogával.
SvelteKit + Cloudflare (1 Worker: frontend + API), D1 + Durable Objects + R2.

A régi Flutter+Hono prototípus az `old` branchen maradt meg.

## Fejlesztés

```bash
pnpm install
pnpm dev
```

Cloudflare bindingokkal (D1/DO/R2) helyi előnézet build után:

```bash
pnpm build
pnpm cf:dev
```

## Ellenőrzés

```bash
pnpm check      # svelte-check + TypeScript
pnpm build      # production build (adapter-cloudflare)
```

## Élő doga (döntés)

Az `adapter-cloudflare` generált Workerje csak `default`-ot exportál, ezért
Durable Object-osztály **nem publikálható ugyanabban a Workerben**.
MVP-ben az élő doga állapota D1-ben él + a kliens pollingol (2–3 mp) —
tantermi léptékben (10–40 fő) ez bőven elég, és nincs WS-kapcsolathiány.

Ha később skálázni kell: a régi DO-s `QuizSession` gép (lásd `old` branch:
`apps/api/src/quiz/`) átköltözik egy külön `apps/do` Workerbe, amit a
SvelteKit Worker service bindingon (`QUIZ_SESSION`) ér el. A wrangler.jsonc
és az API-felület (`/api/quiz`) úgy készül, hogy ez a csere ne törje a klienst.

## Deploy (később, ha lesz Cloudflare hozzáférés)

```bash
wrangler d1 create leardy          # database_id beírása wrangler.jsonc-be
wrangler r2 bucket create leardy-assets
wrangler d1 migrations apply leardy --remote
pnpm deploy
```

# Leardy

Ez a Leardy, egy tanulós webapp. A **Ferences Ösztöndíj Program** keretében
készült a **2026/2027-es tanévben**.

Azért csináltuk, hogy ne kelljen füzetből meg szétszórt jegyzetekből
tanulni: itt vannak a leckék, a kvízek meg a kártyák egy helyen.

**Fejlesztők:** [Dezső Benedek Péter](https://dezso.hu) és Fidrich Bercel

**Elérhetőség:** [leardy.dezso.hu](https://leardy.dezso.hu)

## Mit tud?

- **Leckék:** tantárgyakra, szintekre és tananyagokra bontva, rendes
  magyarázó szöveggel.
- **Kvízek:** minden leckéhez tartozik pár kérdés (feleletválasztós,
  igaz-hamis, párosítós, sorbarakós). A végén megmondja, mit rontottál el.
- **Kártyák:** hivatalos kártyacsomagok a leckékhez, plusz csinálhatsz
  saját csomagot is, és átnézheted őket tanulós módban.
- **Tanterem:** a tanár létrehoz egy osztályt kóddal, kioszt feladatokat
  meg beadandókat, te meg csatlakozol és beküldöd a megoldást.
- **Haladás:** megjegyzi, hol tartasz, és mutatja a statisztikáidat.

## Hogy futtatom helyben?

Először telepítsd a függőségeket:

```bash
pnpm install
```

Aztán indítsd el fejlesztői módban:

```bash
pnpm dev
```

Böngészőben megnyitod, és már tanulhatsz is.

## Adatbázis

Cloudflare D1-et használ. Az egyetlen `migrations/0001_init.sql` fájl hozza
létre a teljes sémát és a hét alapértelmezett tantárgyat: Angol, Német,
Olasz, Történelem, Irodalom, Nyelvtan, Matematika. Minden más tábla üresen
indul, szintek és demó tananyag nélkül. Helyben így inicializálod:

```bash
pnpm cf:db:migrate:local
```

Élesben pedig:

```bash
pnpm cf:db:migrate
```

A migráció nem töröl meglévő adatokat. Teljes újraépítés előtt az adatbázis
régi tábláit és migrációs előzményeit külön kell törölni.

## Élesítés

```bash
pnpm deploy
```

Ez buildel, aztán feltolja Cloudflare-re wranglerrel.

## Környezeti változók

Jelszó-emlékeztető e-mailhez Amazon SES kell. Minta a `.env.example`
fájlban van. A két kulcsot **nem** fájlba írjuk, hanem secretként:

```bash
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
```

Helyi fejlesztéshez ugyanezek mehetnek a `.dev.vars` fájlba.

## Mappa felépítés

- `src/routes` - az oldalak és az API végpontok,
- `src/lib` - a megosztott kód (kvízlejátszó, kártyák, tananyag-kezelés),
- `src/lib/server` - a szerver oldali dolgok (adatbázis, tanterem, e-mail),
- `migrations` - a teljes adatbázisséma és a hét tantárgy egy init SQL-ben,
- `static` - ikonok meg ilyesmik.

## Technológiák

SvelteKit, TypeScript, Tailwind, Cloudflare Workers + D1 + R2.

Jó tanulást!

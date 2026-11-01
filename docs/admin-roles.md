# Admin szerepek üzemeltetése

## Szerepek

- `student`, `teacher`: automatikus, az e-mail helyi része alapján.
- `school_leader`, `admin`, `developer`: csak fejlesztő oszthatja a `/admin/fejleszto` oldalon.
- Az automatika kiemelt szerepet soha nem fokoz le.

## Első fejlesztő beállítása

Két út van, SQL nélkül is megy:

1. Állíts be egy `ADMIN_SETUP_KEY` secretet (`wrangler secret put ADMIN_SETUP_KEY`, helyben `.dev.vars`).
2. Lépj be Google fiókkal, majd nyisd meg a `/admin/bootstrap` oldalt és add meg az e-mail-címed plusz a kulcsot.

A végpont egyszeri: ha már van `developer` szerep, minden további hívás 403-at ad.
Vészhelyzetre megmarad az SQL is:

```sql
UPDATE users SET role = 'developer', is_admin = 1 WHERE email = 'te@szentangela.hu';
```

Helyi ellenőrzés után:

```sh
pnpm exec wrangler d1 execute leardy-fop-db --local --command "UPDATE users SET role = 'developer', is_admin = 1 WHERE email = 'te@szentangela.hu'"
```

Élesben ugyanez `--remote` kapcsolóval. Utána a szereposztás már a felületen történik, minden lépés az `admin_actions` naplóba kerül.

## Tiltás és némítás

- `ban`: a fiók nem tud belépni, a munkamenet érvénytelen. Lejáratkor automatikusan felold.
- `mute`: olvashat és tanulhat, de nem írhat. Minden író API 403-at ad.
- Mindkettőhöz kötelező az indok, admin és fejlesztő mentesül a némítás alól.

## Séma

A `migrations/0015_admin_roles.sql` hozza a `suspended_until`, `muted_until`, indok mezőket és az `admin_actions` táblát. Emellett az `ensureAdminSchema` futásidőben is pótolja ugyanezt, így a szerver indulás önjavító.

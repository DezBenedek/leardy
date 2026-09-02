# Leardy

Offline-first tanuló füzet. A kártyák helyben élnek; a Tanterem csak belépve jelenik meg.

## Felépítés

```
apps/mobile   Flutter (iOS + Android)
apps/api      Hono + Cloudflare Workers (D1, Durable Objects)
```

## Mobil

```bash
cd apps/mobile
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter run
```

## API (helyi)

```bash
cd apps/api
pnpm install
pnpm dev
```

Az app alapból `http://127.0.0.1:8787`-re hív (Android emulátoron `10.0.2.2`). A fiók opcionális: név + jelszó a Beállításokban.

```bash
# Flutter
cd apps/mobile && flutter test && dart analyze lib test

# API
cd apps/api && pnpm test
```

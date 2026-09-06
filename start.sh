#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$ROOT/apps/api"
MOBILE_DIR="$ROOT/apps/mobile"
PORT="${PORT:-8787}"
API_PID=""
STARTED_API=0
BASE=""
DEVICE_ID=""

log() { printf '\n\033[1m==> %s\033[0m\n' "$*" >&2; }
die() { printf 'hiba: %s\n' "$*" >&2; exit 1; }

cleanup() {
  if [[ "$STARTED_API" -eq 1 && -n "${API_PID:-}" ]]; then
    log "API leállítása"
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

find_adb() {
  local c sdk
  if command -v adb >/dev/null 2>&1; then
    command -v adb
    return 0
  fi
  for c in \
    "${ANDROID_HOME:-}/platform-tools/adb" \
    "${ANDROID_SDK_ROOT:-}/platform-tools/adb" \
    "$HOME/Library/Android/sdk/platform-tools/adb" \
    "$HOME/Android/Sdk/platform-tools/adb"
  do
    if [[ -x "$c" ]]; then
      echo "$c"
      return 0
    fi
  done
  if command -v flutter >/dev/null 2>&1; then
    sdk="$(flutter config --machine 2>/dev/null | python3 -c 'import json,sys; print((json.load(sys.stdin) or {}).get("android-sdk") or "")' 2>/dev/null || true)"
    if [[ -n "$sdk" && -x "$sdk/platform-tools/adb" ]]; then
      echo "$sdk/platform-tools/adb"
      return 0
    fi
  fi
  return 1
}

lan_ip() {
  local iface ip
  iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}' || true)"
  if [[ -n "$iface" ]]; then
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    [[ -n "$ip" ]] && { echo "$ip"; return 0; }
  fi
  for iface in en0 en1 en2; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    [[ -n "$ip" ]] && { echo "$ip"; return 0; }
  done
  ip="$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" { print $2; exit }' || true)"
  [[ -n "$ip" ]] && { echo "$ip"; return 0; }
  echo "127.0.0.1"
}

api_ok() {
  curl -fsS -m 2 "$1/health" >/dev/null 2>&1
}

ensure_api() {
  if api_ok "http://127.0.0.1:$PORT"; then
    log "API már fut: http://127.0.0.1:$PORT"
    return 0
  fi

  local pids
  pids="$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    log "A $PORT foglalt, de /health nem válaszol — leállítom"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
  fi

  command -v pnpm >/dev/null 2>&1 || die "pnpm kell az API-hoz (apps/api)"
  [[ -d "$API_DIR" ]] || die "nincs $API_DIR"

  log "D1 migráció"
  (cd "$API_DIR" && pnpm exec wrangler d1 migrations apply leardy --local)

  log "API indítása 0.0.0.0:$PORT"
  (cd "$API_DIR" && pnpm exec wrangler dev --ip 0.0.0.0 --port "$PORT") &
  API_PID=$!
  STARTED_API=1

  local i
  for i in $(seq 1 50); do
    if api_ok "http://127.0.0.1:$PORT"; then
      log "API kész"
      return 0
    fi
    if ! kill -0 "$API_PID" 2>/dev/null; then
      die "az API kilépett. Ne legyen másik wrangler dev — D1 SQLITE_BUSY"
    fi
    sleep 0.4
  done
  die "az API nem indult el időben"
}

resolve_target() {
  local adb lan serials physical emulator
  lan="$(lan_ip)"
  adb="$(find_adb || true)"
  BASE="http://$lan:$PORT"
  DEVICE_ID=""

  if [[ -z "$adb" ]]; then
    return 0
  fi

  serials="$("$adb" devices 2>/dev/null | awk 'NR>1 && $2=="device" { print $1 }')"
  physical="$(printf '%s\n' "$serials" | awk '!/emulator-/' | head -n 1)"
  emulator="$(printf '%s\n' "$serials" | awk '/emulator-/' | head -n 1)"

  if [[ -n "$physical" ]]; then
    DEVICE_ID="$physical"
    log "Telefon USB-n: adb reverse :$PORT"
    "$adb" reverse tcp:"$PORT" tcp:"$PORT" >/dev/null
    BASE="http://127.0.0.1:$PORT"
    return 0
  fi
  if [[ -n "$emulator" ]]; then
    DEVICE_ID="$emulator"
    BASE="http://10.0.2.2:$PORT"
  fi
}

command -v flutter >/dev/null 2>&1 || die "flutter nincs a PATH-on"
command -v curl >/dev/null 2>&1 || die "curl kell"

ensure_api
resolve_target
[[ "$BASE" == http://* ]] || die "érvénytelen API cím: $BASE"
log "App → $BASE${DEVICE_ID:+  ($DEVICE_ID)}"

cd "$MOBILE_DIR"
args=(run --dart-define="API_BASE=$BASE")
if [[ -n "$DEVICE_ID" ]]; then
  args+=(-d "$DEVICE_ID")
fi
flutter "${args[@]}"

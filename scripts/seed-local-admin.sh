#!/usr/bin/env bash
# Helyi szerep kiosztas es school_id visszamenoleges feltoltese.
# Hasznalat: ./scripts/seed-local-admin.sh [email] [role]
# Pelda: ./scripts/seed-local-admin.sh hangositas@szentangela.hu developer
# Nem az alkalmazas kodjaba egetett ertek: parameterezheto script,
# ami a LOCAL D1 adatbazison fut. Elesre nem hat.
set -euo pipefail

EMAIL="${1:-hangositas@szentangela.hu}"
ROLE="${2:-admin}"
EMAIL_LOWER="$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]')"

if ! printf '%s' "$EMAIL_LOWER" | grep -Eq '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'; then
	echo "Hibas e-mail-cim: $EMAIL" >&2
	exit 1
fi

case "$ROLE" in
	admin|developer|school_leader) ;;
	*) echo "Hibas szerep: $ROLE (admin, developer vagy school_leader lehet)" >&2; exit 1 ;;
esac

IS_ADMIN=0
if [ "$ROLE" = "admin" ] || [ "$ROLE" = "developer" ]; then
	IS_ADMIN=1
fi

# Hianyzo oszlopok potlasa regi helyi DB-n (ha mar letezik, nem hiba).
for DDL in \
	"ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'" \
	"ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0" \
	"ALTER TABLE users ADD COLUMN school_id TEXT NOT NULL DEFAULT ''" \
	; do
	pnpm exec wrangler d1 execute leardy-fop-db --local --command "$DDL" >/dev/null 2>&1 || true
done

echo "Szerep kiosztas: $EMAIL_LOWER -> $ROLE"
pnpm exec wrangler d1 execute leardy-fop-db --local --command "
INSERT INTO users (id, name, email, school_id, pass_hash, salt, created_at, role, xp, streak, last_study_date, is_admin)
VALUES (
	'local-admin-' || substr(hex(randomblob(8)), 1, 8),
	'Helyi kiemelt felhasznalo',
	'$EMAIL_LOWER',
	substr('$EMAIL_LOWER', instr('$EMAIL_LOWER', '@') + 1),
	'google-oauth', '', 0, '$ROLE', 0, 0, '', $IS_ADMIN
)
ON CONFLICT(email) DO UPDATE SET
	role = '$ROLE',
	is_admin = $IS_ADMIN,
	school_id = excluded.school_id;
"

echo "school_id visszamenoleges feltoltese domain alapjan"
pnpm exec wrangler d1 execute leardy-fop-db --local --command "
UPDATE users
SET school_id = lower(substr(email, instr(email, '@') + 1))
WHERE (school_id IS NULL OR school_id = '') AND instr(email, '@') > 0;
"

echo "Ellenorzes:"
pnpm exec wrangler d1 execute leardy-fop-db --local --command "
SELECT email, role, is_admin, school_id FROM users ORDER BY email;
SELECT COUNT(*) AS hianyzo_school_id FROM users WHERE school_id IS NULL OR school_id = '';
"

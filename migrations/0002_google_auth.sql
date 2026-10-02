-- Google belépés: google_sub tárolása a Google fiók azonosítójához.
-- Idempotens, régi és friss DB-n is biztonságosan futtatható.
ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);

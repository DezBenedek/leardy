-- Auth hard reset: régi e-mail + jelszó maradványok törlése, több iskolás belépéshez school_id.
-- Idempotens, régi és friss DB-n is biztonságosan futtatható.
-- A school_id az e-mail domainje (pl. szentangela.hu), új iskolánál automatikusan új érték.
ALTER TABLE users ADD COLUMN school_id TEXT NOT NULL DEFAULT '';
UPDATE users SET school_id = lower(substr(email, instr(email, '@') + 1))
WHERE (school_id IS NULL OR school_id = '') AND instr(email, '@') > 0;
-- Régi jelszóhash-ek törlése: jelszavas belépés megszűnt, csak Google OAuth marad.
UPDATE users SET pass_hash = 'google-oauth', salt = '' WHERE pass_hash != 'google-oauth' OR salt != '';
-- Jelszó-helyreállítás megszűnt, a token tábla felesleges.
DROP TABLE IF EXISTS password_reset_tokens;
CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);

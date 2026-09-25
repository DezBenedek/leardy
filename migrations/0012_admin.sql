-- Superadmin-jelölés a fiókon (idempotens).
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
UPDATE users SET is_admin = 1 WHERE lower(email) = lower('benedek@dezso.hu');

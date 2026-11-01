-- Admin szerepek: tiltas, nemitas es naplo.
-- Minden utasitas idempotens, ujrafuttathato.

ALTER TABLE users ADD COLUMN suspended_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN muted_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN suspended_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN muted_reason TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS admin_actions (
	id TEXT PRIMARY KEY,
	actor_id TEXT NOT NULL,
	target_id TEXT,
	action TEXT NOT NULL,
	reason TEXT NOT NULL DEFAULT '',
	expires_at INTEGER,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_actor ON admin_actions(actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON admin_actions(target_id, created_at);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

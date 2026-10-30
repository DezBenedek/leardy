-- Publikus API kulcsok tanári fiókokhoz.
-- Egy tanár több kulcsot is létrehozhat, mindegyik visszavonható.
-- A kulcsból csak a hash-t tároljuk, a teljes érték csak létrehozáskor látszik.

CREATE TABLE IF NOT EXISTS api_keys (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name TEXT NOT NULL DEFAULT '',
	prefix TEXT NOT NULL DEFAULT '',
	key_hash TEXT NOT NULL,
	scopes_json TEXT NOT NULL DEFAULT '[]',
	last_used_at INTEGER,
	created_at INTEGER NOT NULL,
	revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

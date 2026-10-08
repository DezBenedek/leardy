CREATE TABLE IF NOT EXISTS level_settings (
	level_id TEXT PRIMARY KEY REFERENCES levels(id) ON DELETE CASCADE,
	owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
	published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1))
);

CREATE TABLE IF NOT EXISTS level_editors (
	level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
	email TEXT NOT NULL COLLATE NOCASE,
	PRIMARY KEY (level_id, email)
);

CREATE INDEX IF NOT EXISTS idx_level_editors_email ON level_editors(email);
CREATE INDEX IF NOT EXISTS idx_level_settings_owner ON level_settings(owner_id);

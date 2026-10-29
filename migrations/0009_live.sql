-- Élő dolgozat: munkamenetek és végeredmények.
CREATE TABLE IF NOT EXISTS live_sessions (
	id TEXT PRIMARY KEY,
	classroom_id TEXT NOT NULL,
	teacher_id TEXT NOT NULL,
	title TEXT NOT NULL DEFAULT '',
	config_json TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'lobby',
	created_at INTEGER,
	started_at INTEGER,
	finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS live_results (
	session_id TEXT NOT NULL,
	user_id TEXT NOT NULL,
	display_name TEXT NOT NULL DEFAULT '',
	score INTEGER NOT NULL DEFAULT 0,
	total INTEGER NOT NULL DEFAULT 0,
	finished_at INTEGER,
	PRIMARY KEY (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_live_sessions_class ON live_sessions(classroom_id, status);

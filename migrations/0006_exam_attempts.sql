-- Témazáró gyakorlások naplózása: mikor, milyen eredménnyel, leckénként mennyi hiba.
CREATE TABLE IF NOT EXISTS exam_attempts (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
	score INTEGER NOT NULL DEFAULT 0,
	total INTEGER NOT NULL DEFAULT 0,
	mistakes_json TEXT NOT NULL DEFAULT '{}',
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exam_user_topic ON exam_attempts(user_id, topic_id, created_at);

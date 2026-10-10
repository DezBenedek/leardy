-- A kvízkérdés-sablonok tulajdonosa mindig egy felhasználói fiók.
CREATE TABLE IF NOT EXISTS quiz_templates (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	id TEXT NOT NULL,
	seed_json TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_quiz_templates_user_created ON quiz_templates(user_id, created_at DESC, id);

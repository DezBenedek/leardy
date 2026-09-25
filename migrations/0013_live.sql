-- Élő dolgozat: csatlakozós, tanár által indított/léptetett menetek.
CREATE TABLE IF NOT EXISTS live_sessions (
	id TEXT PRIMARY KEY,
	code TEXT NOT NULL UNIQUE,
	assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
	classroom_id TEXT REFERENCES classrooms(id) ON DELETE CASCADE,
	teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	status TEXT NOT NULL DEFAULT 'lobby',
	qmode TEXT NOT NULL DEFAULT 'same',
	pacing TEXT NOT NULL DEFAULT 'global',
	per_q_secs INTEGER NOT NULL DEFAULT 30,
	total_mins INTEGER NOT NULL DEFAULT 0,
	count INTEGER NOT NULL DEFAULT 0,
	total_q INTEGER NOT NULL DEFAULT 0,
	current_idx INTEGER NOT NULL DEFAULT 0,
	deadline_ts INTEGER NOT NULL DEFAULT 0,
	ends_at INTEGER NOT NULL DEFAULT 0,
	started_at INTEGER NOT NULL DEFAULT 0,
	finished_at INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS live_participants (
	session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	joined_at INTEGER NOT NULL,
	finished_at INTEGER NOT NULL DEFAULT 0,
	score INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS live_items (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	idx INTEGER NOT NULL,
	question_text TEXT NOT NULL,
	type TEXT NOT NULL DEFAULT 'choice',
	options_json TEXT NOT NULL DEFAULT '[]',
	correct_answer TEXT NOT NULL DEFAULT '',
	left_text TEXT
);

CREATE TABLE IF NOT EXISTS live_answers (
	item_id TEXT PRIMARY KEY REFERENCES live_items(id) ON DELETE CASCADE,
	session_id TEXT NOT NULL,
	user_id TEXT NOT NULL,
	idx INTEGER NOT NULL,
	answer TEXT NOT NULL DEFAULT '',
	correct INTEGER NOT NULL DEFAULT 0,
	at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_live_code ON live_sessions(code);
CREATE INDEX IF NOT EXISTS idx_live_part ON live_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_live_items ON live_items(session_id, user_id);
CREATE INDEX IF NOT EXISTS idx_live_answers ON live_answers(session_id, user_id);

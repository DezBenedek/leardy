-- A diákútmutató fiókonként és fejezetenként megőrzött állapota.
CREATE TABLE IF NOT EXISTS tutorial_progress (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	tour_id TEXT NOT NULL,
	version INTEGER NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'skipped', 'completed')),
	step_id TEXT NOT NULL,
	context_json TEXT NOT NULL DEFAULT '{}',
	revision INTEGER NOT NULL DEFAULT 1,
	operation_id TEXT NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (user_id, tour_id)
);

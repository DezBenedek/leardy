-- AI generálás korlát és naplózás (csak metaadat, lecke szöveg nélkül).
-- Leckénként óránként legfeljebb 5, felhasználónként naponta legfeljebb 30 hívás.
CREATE TABLE IF NOT EXISTS ai_generations (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
	kind TEXT NOT NULL DEFAULT 'quiz',
	requested INTEGER NOT NULL DEFAULT 0,
	accepted INTEGER NOT NULL DEFAULT 0,
	skipped INTEGER NOT NULL DEFAULT 0,
	status TEXT NOT NULL DEFAULT 'ok',
	duration_ms INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_generations_lesson_hour ON ai_generations(lesson_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_generations_user_day ON ai_generations(user_id, created_at);

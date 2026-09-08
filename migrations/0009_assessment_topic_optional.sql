-- Egyedi kvízek témakör nélkül: topic_id NULL-lehető.
-- (SQLite-ban nincs ALTER COLUMN, ezért tábla-újraépítés adatmegtartással.)
CREATE TABLE assessments_new (
	id TEXT PRIMARY KEY,
	teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	max_attempts INTEGER NOT NULL DEFAULT 0,
	time_limit_mins INTEGER NOT NULL DEFAULT 0,
	shuffle INTEGER NOT NULL DEFAULT 1,
	feedback_delayed INTEGER NOT NULL DEFAULT 0,
	is_exam INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);

INSERT INTO assessments_new
	(id, teacher_id, topic_id, title, max_attempts, time_limit_mins, shuffle, feedback_delayed, is_exam, created_at)
	SELECT id, teacher_id, topic_id, title, max_attempts, time_limit_mins, shuffle, feedback_delayed, is_exam, created_at
	FROM assessments;

DROP TABLE assessments;
ALTER TABLE assessments_new RENAME TO assessments;

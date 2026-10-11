-- A napi aktivitás megmarad a leckék és kártyák újbóli gyakorlásakor is.
CREATE TABLE IF NOT EXISTS learning_days (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	day TEXT NOT NULL,
	PRIMARY KEY (user_id, day)
);

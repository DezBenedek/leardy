-- SM-2 ütemezés a meglévő card_progress táblában, új tábla nélkül.
-- Sor takarékos: csak a megérintett kártyához jön létre sor, ismétléskor nincs új sor.
CREATE TABLE IF NOT EXISTS card_progress (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	card_key TEXT NOT NULL,
	known INTEGER NOT NULL DEFAULT 0,
	seen INTEGER NOT NULL DEFAULT 0,
	updated_at TEXT NOT NULL DEFAULT '',
	PRIMARY KEY (user_id, card_key)
);
ALTER TABLE card_progress ADD COLUMN repetitions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE card_progress ADD COLUMN ease REAL NOT NULL DEFAULT 2.5;
ALTER TABLE card_progress ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE card_progress ADD COLUMN due_day INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_card_progress_due ON card_progress(user_id, due_day);

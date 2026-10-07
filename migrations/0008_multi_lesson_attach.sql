-- Több leckéhez csatolható kártyacsomagok: kapcsolótáblák.
-- A régi egy-leckés `lesson_id` oszlopok megmaradnak elsődlegesnek,
-- az összes csatolást az új táblák tartják. Idempotens.

CREATE TABLE IF NOT EXISTS deck_lessons (
	deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
	lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
	PRIMARY KEY (deck_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS lesson_card_pack_lessons (
	pack_id TEXT NOT NULL REFERENCES lesson_card_packs(id) ON DELETE CASCADE,
	lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
	PRIMARY KEY (pack_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_deck_lessons_deck ON deck_lessons(deck_id);
CREATE INDEX IF NOT EXISTS idx_deck_lessons_lesson ON deck_lessons(lesson_id);
CREATE INDEX IF NOT EXISTS idx_pack_lessons_pack ON lesson_card_pack_lessons(pack_id);
CREATE INDEX IF NOT EXISTS idx_pack_lessons_lesson ON lesson_card_pack_lessons(lesson_id);

INSERT OR IGNORE INTO deck_lessons (deck_id, lesson_id)
 SELECT id, lesson_id FROM decks WHERE lesson_id IS NOT NULL AND TRIM(lesson_id) != '';

INSERT OR IGNORE INTO lesson_card_pack_lessons (pack_id, lesson_id)
 SELECT id, lesson_id FROM lesson_card_packs WHERE lesson_id IS NOT NULL AND TRIM(lesson_id) != '';

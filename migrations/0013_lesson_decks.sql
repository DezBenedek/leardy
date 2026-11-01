-- Hivatalos lecke csomagok: a decks tábla is_lesson jelölést kap.
-- is_lesson = 0: privát gyakorló deck, tulajdonosa a Kártyák felől szerkeszti.
-- is_lesson = 1: hivatalos lecke deck, csak szint szerkesztői joggal,
-- csak a tananyag szerkesztő API-n át írható. Tulajdonosa a rendszerfelhasználó,
-- a létrehozó tanár a created_by mezőben marad meg.
-- Visszamenőleges átjelölés nincs: a már csatolt privát deckek is_lesson = 0
-- értékkel olvashatók maradnak, csak az új lecke deckek kapnak 1-et.

-- Rendszerfelhasználó a hivatalos deckek tulajdonosának (soha nem jelentkezik be).
INSERT OR IGNORE INTO users (id, name, email, pass_hash, salt, created_at, role)
VALUES ('system', 'Leardy tananyag', 'system@local.invalid', 'system', '', 0, 'teacher');

ALTER TABLE decks ADD COLUMN is_lesson INTEGER NOT NULL DEFAULT 0;
ALTER TABLE decks ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_decks_lesson_flag ON decks(is_lesson);

-- Leckénkénti sorrend a kapcsolótáblában (egy deck több leckénél más helyen lehet).
ALTER TABLE deck_lessons ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_deck_lessons_lesson_sort ON deck_lessons(lesson_id, sort);

-- Régi egy-leckés csatolások pótlása a kapcsolóban (idempotens).
INSERT OR IGNORE INTO deck_lessons (deck_id, lesson_id)
SELECT id, lesson_id FROM decks WHERE lesson_id IS NOT NULL AND TRIM(lesson_id) != '';

-- Gyorsítótár érvényesítés hivatalos deck írásokra.
-- A curriculum_revisions tábla a 0003 migrációból adott.
CREATE TRIGGER IF NOT EXISTS cache_decks_insert AFTER INSERT ON decks
BEGIN
	UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog' AND NEW.is_lesson = 1;
	INSERT INTO curriculum_revisions (scope, revision)
	SELECT 'subject:' || NEW.subject_id, 1 WHERE NEW.is_lesson = 1 AND NEW.subject_id IS NOT NULL
	ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER IF NOT EXISTS cache_decks_delete BEFORE DELETE ON decks
BEGIN
	UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog' AND OLD.is_lesson = 1;
	INSERT INTO curriculum_revisions (scope, revision)
	SELECT 'subject:' || OLD.subject_id, 1 WHERE OLD.is_lesson = 1 AND OLD.subject_id IS NOT NULL
	ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER IF NOT EXISTS cache_decks_update BEFORE UPDATE ON decks
BEGIN
	UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog' AND (NEW.is_lesson = 1 OR OLD.is_lesson = 1);
	INSERT INTO curriculum_revisions (scope, revision)
	SELECT 'subject:' || id, 1 FROM (
		SELECT NEW.subject_id AS id WHERE NEW.is_lesson = 1 AND NEW.subject_id IS NOT NULL
		UNION
		SELECT OLD.subject_id AS id WHERE OLD.is_lesson = 1 AND OLD.subject_id IS NOT NULL
	) WHERE id IS NOT NULL GROUP BY id
	ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER IF NOT EXISTS cache_deck_lessons_insert AFTER INSERT ON deck_lessons
BEGIN
	UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog'
		AND (SELECT COALESCE(is_lesson, 0) FROM decks WHERE id = NEW.deck_id) = 1;
	INSERT INTO curriculum_revisions (scope, revision)
	SELECT 'subject:' || l.subject_id, 1 FROM lessons le
	JOIN materials m ON m.id = le.material_id
	JOIN levels l ON l.id = m.level_id
	WHERE le.id = NEW.lesson_id
	AND (SELECT COALESCE(is_lesson, 0) FROM decks WHERE id = NEW.deck_id) = 1
	GROUP BY l.subject_id
	ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER IF NOT EXISTS cache_deck_lessons_delete BEFORE DELETE ON deck_lessons
BEGIN
	UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog'
		AND (SELECT COALESCE(is_lesson, 0) FROM decks WHERE id = OLD.deck_id) = 1;
	INSERT INTO curriculum_revisions (scope, revision)
	SELECT 'subject:' || l.subject_id, 1 FROM lessons le
	JOIN materials m ON m.id = le.material_id
	JOIN levels l ON l.id = m.level_id
	WHERE le.id = OLD.lesson_id
	AND (SELECT COALESCE(is_lesson, 0) FROM decks WHERE id = OLD.deck_id) = 1
	GROUP BY l.subject_id
	ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER IF NOT EXISTS cache_deck_cards_insert AFTER INSERT ON deck_cards
BEGIN
	UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog'
		AND (SELECT COALESCE(is_lesson, 0) FROM decks WHERE id = NEW.deck_id) = 1;
	INSERT INTO curriculum_revisions (scope, revision)
	SELECT 'subject:' || d.subject_id, 1 FROM decks d
	WHERE d.id = NEW.deck_id AND COALESCE(d.is_lesson, 0) = 1 AND d.subject_id IS NOT NULL
	GROUP BY d.subject_id
	ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER IF NOT EXISTS cache_deck_cards_delete BEFORE DELETE ON deck_cards
BEGIN
	UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog'
		AND (SELECT COALESCE(is_lesson, 0) FROM decks WHERE id = OLD.deck_id) = 1;
	INSERT INTO curriculum_revisions (scope, revision)
	SELECT 'subject:' || d.subject_id, 1 FROM decks d
	WHERE d.id = OLD.deck_id AND COALESCE(d.is_lesson, 0) = 1 AND d.subject_id IS NOT NULL
	GROUP BY d.subject_id
	ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER IF NOT EXISTS cache_deck_cards_update BEFORE UPDATE ON deck_cards
BEGIN
	UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog'
		AND ((SELECT COALESCE(is_lesson, 0) FROM decks WHERE id = NEW.deck_id) = 1
			OR (SELECT COALESCE(is_lesson, 0) FROM decks WHERE id = OLD.deck_id) = 1);
END;

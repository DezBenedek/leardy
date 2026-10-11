-- Verziózott tananyagcache és ismétlésmentes offline eredménymentés.
CREATE TABLE curriculum_revisions (scope TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0);
INSERT INTO curriculum_revisions VALUES ('catalog', 1);
INSERT INTO curriculum_revisions SELECT 'subject:' || id, 1 FROM subjects;
CREATE TABLE progress_events (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL, lesson_id TEXT NOT NULL, occurred_at INTEGER NOT NULL,
 quiz_version TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL,
 status TEXT NOT NULL, PRIMARY KEY (user_id, event_id)
);
ALTER TABLE lesson_progress ADD COLUMN event_at INTEGER NOT NULL DEFAULT 0;
UPDATE lesson_progress SET event_at = CASE WHEN updated_at > 100000000000 THEN updated_at ELSE updated_at * 1000 END;

CREATE TRIGGER cache_subjects_insert AFTER INSERT ON subjects
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT NEW.id AS id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_subjects_delete BEFORE DELETE ON subjects
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT OLD.id AS id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_subjects_update BEFORE UPDATE ON subjects
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT OLD.id AS id UNION SELECT NEW.id AS id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_levels_insert AFTER INSERT ON levels
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT NEW.subject_id AS id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_levels_delete BEFORE DELETE ON levels
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT OLD.subject_id AS id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_levels_update BEFORE UPDATE ON levels
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT OLD.subject_id AS id UNION SELECT NEW.subject_id AS id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_materials_insert AFTER INSERT ON materials
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT subject_id AS id FROM levels WHERE id = NEW.level_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_materials_delete BEFORE DELETE ON materials
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT subject_id AS id FROM levels WHERE id = OLD.level_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_materials_update BEFORE UPDATE ON materials
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT subject_id AS id FROM levels WHERE id = OLD.level_id UNION SELECT subject_id AS id FROM levels WHERE id = NEW.level_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_lessons_insert AFTER INSERT ON lessons
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM materials m JOIN levels l ON l.id=m.level_id WHERE m.id=NEW.material_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_lessons_delete BEFORE DELETE ON lessons
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM materials m JOIN levels l ON l.id=m.level_id WHERE m.id=OLD.material_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_lessons_update BEFORE UPDATE ON lessons
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM materials m JOIN levels l ON l.id=m.level_id WHERE m.id=OLD.material_id UNION SELECT l.subject_id AS id FROM materials m JOIN levels l ON l.id=m.level_id WHERE m.id=NEW.material_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_quizzes_insert AFTER INSERT ON quizzes
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=NEW.lesson_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_quizzes_delete BEFORE DELETE ON quizzes
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=OLD.lesson_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_quizzes_update BEFORE UPDATE ON quizzes
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=OLD.lesson_id UNION SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=NEW.lesson_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_quiz_questions_insert AFTER INSERT ON quiz_questions
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM quizzes q JOIN lessons le ON le.id=q.lesson_id JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE q.id=NEW.quiz_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_quiz_questions_delete BEFORE DELETE ON quiz_questions
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM quizzes q JOIN lessons le ON le.id=q.lesson_id JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE q.id=OLD.quiz_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_quiz_questions_update BEFORE UPDATE ON quiz_questions
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM quizzes q JOIN lessons le ON le.id=q.lesson_id JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE q.id=OLD.quiz_id UNION SELECT l.subject_id AS id FROM quizzes q JOIN lessons le ON le.id=q.lesson_id JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE q.id=NEW.quiz_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_lesson_cards_insert AFTER INSERT ON lesson_cards
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=NEW.lesson_id UNION SELECT l.subject_id AS id FROM lesson_card_pack_lessons a JOIN lessons le ON le.id=a.lesson_id JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE a.pack_id=NEW.pack_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_lesson_cards_delete BEFORE DELETE ON lesson_cards
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=OLD.lesson_id UNION SELECT l.subject_id AS id FROM lesson_card_pack_lessons a JOIN lessons le ON le.id=a.lesson_id JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE a.pack_id=OLD.pack_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_lesson_cards_update BEFORE UPDATE ON lesson_cards
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=OLD.lesson_id UNION SELECT l.subject_id AS id FROM lesson_card_pack_lessons a JOIN lessons le ON le.id=a.lesson_id JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE a.pack_id=OLD.pack_id UNION SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=NEW.lesson_id UNION SELECT l.subject_id AS id FROM lesson_card_pack_lessons a JOIN lessons le ON le.id=a.lesson_id JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE a.pack_id=NEW.pack_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_lesson_card_packs_insert AFTER INSERT ON lesson_card_packs
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=NEW.lesson_id UNION SELECT l.subject_id AS id FROM lesson_card_pack_lessons a JOIN lessons le ON le.id=a.lesson_id JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE a.pack_id=NEW.id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_lesson_card_packs_delete BEFORE DELETE ON lesson_card_packs
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=OLD.lesson_id UNION SELECT l.subject_id AS id FROM lesson_card_pack_lessons a JOIN lessons le ON le.id=a.lesson_id JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE a.pack_id=OLD.id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_lesson_card_packs_update BEFORE UPDATE ON lesson_card_packs
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=OLD.lesson_id UNION SELECT l.subject_id AS id FROM lesson_card_pack_lessons a JOIN lessons le ON le.id=a.lesson_id JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE a.pack_id=OLD.id UNION SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=NEW.lesson_id UNION SELECT l.subject_id AS id FROM lesson_card_pack_lessons a JOIN lessons le ON le.id=a.lesson_id JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE a.pack_id=NEW.id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_lesson_card_pack_lessons_insert AFTER INSERT ON lesson_card_pack_lessons
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=NEW.lesson_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_lesson_card_pack_lessons_delete BEFORE DELETE ON lesson_card_pack_lessons
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=OLD.lesson_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_lesson_card_pack_lessons_update BEFORE UPDATE ON lesson_card_pack_lessons
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=OLD.lesson_id UNION SELECT l.subject_id AS id FROM lessons le JOIN materials m ON m.id=le.material_id JOIN levels l ON l.id=m.level_id WHERE le.id=NEW.lesson_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_level_settings_insert AFTER INSERT ON level_settings
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT subject_id AS id FROM levels WHERE id=NEW.level_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_level_settings_delete BEFORE DELETE ON level_settings
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT subject_id AS id FROM levels WHERE id=OLD.level_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER cache_level_settings_update BEFORE UPDATE ON level_settings
BEGIN
 UPDATE curriculum_revisions SET revision = revision + 1 WHERE scope = 'catalog';
 INSERT INTO curriculum_revisions (scope, revision)
 SELECT 'subject:' || id, 1 FROM (SELECT subject_id AS id FROM levels WHERE id=OLD.level_id UNION SELECT subject_id AS id FROM levels WHERE id=NEW.level_id) WHERE id IS NOT NULL GROUP BY id
 ON CONFLICT(scope) DO UPDATE SET revision = revision + 1;
END;

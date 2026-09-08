-- Megosztásonkénti dolgozat-beállítások: próbaszám, időkorlát, keverés,
-- késleltetett visszajelzés és dolgozat-mód a kiadáshoz (assignment) tartozik,
-- nem a feladatsorhoz — minden megosztásnál külön beállítható.
ALTER TABLE assignments ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assignments ADD COLUMN time_limit_mins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assignments ADD COLUMN shuffle INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assignments ADD COLUMN feedback_delayed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assignments ADD COLUMN is_exam INTEGER NOT NULL DEFAULT 0;

-- Meglévő kiadások átveszik a feladatsor addigi beállításait.
UPDATE assignments SET
	max_attempts = (SELECT max_attempts FROM assessments WHERE id = assignments.assessment_id),
	time_limit_mins = (SELECT time_limit_mins FROM assessments WHERE id = assignments.assessment_id),
	shuffle = (SELECT shuffle FROM assessments WHERE id = assignments.assessment_id),
	feedback_delayed = (SELECT feedback_delayed FROM assessments WHERE id = assignments.assessment_id),
	is_exam = (SELECT is_exam FROM assessments WHERE id = assignments.assessment_id);

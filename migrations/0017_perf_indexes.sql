-- Gyakori szűrések indexei: osztály-statisztika, push-élettartam, Felfedezés.
-- Idempotens: csak IF NOT EXISTS indexek, adatot nem módosít.

CREATE INDEX IF NOT EXISTS idx_task_subs_class ON task_submissions(classroom_id);
CREATE INDEX IF NOT EXISTS idx_task_subs_user ON task_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_assignment_subs_class ON assignment_submissions(classroom_id);
CREATE INDEX IF NOT EXISTS idx_assignment_subs_user ON assignment_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_delivery_expires ON push_deliveries(expires_at);
CREATE INDEX IF NOT EXISTS idx_push_delivery_claim ON push_deliveries(delivered_at, next_attempt_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_decks_public_subject ON decks(is_public, subject_id);

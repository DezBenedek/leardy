-- Kérdés szintű opcionális bekezdés bekötés a lecke kvízkészítőhöz.
-- Üres érték = nincs bekötés, a kérdés a kvízblokk szintjén (vagy a teljes leckében) jelenik meg.
ALTER TABLE quiz_questions ADD COLUMN section_slug TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_quiz_questions_section ON quiz_questions(section_slug);

-- Tanári modul bővítés: osztályüzenetek (link/csatolmány).
-- (A classrooms.subject oszlopot az ensureAuthSchema hozza létre új és régi
-- DB-ken is, mint a users role/xp/streak oszlopait.)
CREATE TABLE IF NOT EXISTS messages (
	id TEXT PRIMARY KEY,
	classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
	teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	body TEXT NOT NULL DEFAULT '',
	link_url TEXT,
	ref_type TEXT,
	ref_id TEXT,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_class ON messages(classroom_id, created_at);

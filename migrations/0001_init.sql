-- Leardy: a teljes aktuális séma és a hét alapértelmezett tantárgy.
-- Új adatbázis inicializálásához. Nem töröl meglévő adatokat.
-- Az IF NOT EXISTS és az OR IGNORE miatt újrafuttatható.

-- Auth -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	email TEXT NOT NULL UNIQUE,
	pass_hash TEXT NOT NULL DEFAULT 'google-oauth',
	salt TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	role TEXT NOT NULL DEFAULT 'student',
	xp INTEGER NOT NULL DEFAULT 0,
	streak INTEGER NOT NULL DEFAULT 0,
	last_study_date TEXT NOT NULL DEFAULT '',
	is_admin INTEGER NOT NULL DEFAULT 0,
	google_sub TEXT,
	school_id TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
	token TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Tanterv: Tantárgy → Szint → Tananyag → Lecke + szekció-kvízek ---------------
CREATE TABLE IF NOT EXISTS subjects (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	icon TEXT NOT NULL DEFAULT 'book',
	level_label TEXT NOT NULL DEFAULT 'Szint',
	sort INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS levels (
	id TEXT PRIMARY KEY,
	subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS materials (
	id TEXT PRIMARY KEY,
	level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lessons (
	id TEXT PRIMARY KEY,
	material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	body_md TEXT NOT NULL DEFAULT '',
	sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quizzes (
	id TEXT PRIMARY KEY,
	lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
	section_slug TEXT NOT NULL DEFAULT '',
	title TEXT NOT NULL,
	sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quiz_questions (
	id TEXT PRIMARY KEY,
	quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
	question_text TEXT NOT NULL,
	type TEXT NOT NULL DEFAULT 'choice',
	options_json TEXT NOT NULL DEFAULT '[]',
	correct_answer TEXT NOT NULL DEFAULT '',
	sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lesson_progress (
	user_id TEXT NOT NULL,
	lesson_id TEXT NOT NULL,
	done INTEGER NOT NULL DEFAULT 0,
	score INTEGER,
	total INTEGER,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_levels_subject ON levels(subject_id, sort);
CREATE INDEX IF NOT EXISTS idx_materials_level ON materials(level_id, sort);
CREATE INDEX IF NOT EXISTS idx_lessons_material ON lessons(material_id, sort);
CREATE INDEX IF NOT EXISTS idx_quizzes_lesson ON quizzes(lesson_id, sort);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id, sort);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON lesson_progress(user_id);

-- Hivatalos kártyák és csomagok ------------------------------------------------
CREATE TABLE IF NOT EXISTS lesson_cards (
	id TEXT PRIMARY KEY,
	lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
	section_slug TEXT NOT NULL DEFAULT '',
	front TEXT NOT NULL DEFAULT '',
	back TEXT NOT NULL DEFAULT '',
	sort INTEGER NOT NULL DEFAULT 0,
	pack_id TEXT
);

CREATE TABLE IF NOT EXISTS lesson_card_packs (
	id TEXT PRIMARY KEY,
	card_kind TEXT NOT NULL DEFAULT 'word',
	lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	sort INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lesson_cards_lesson ON lesson_cards(lesson_id, sort);
CREATE INDEX IF NOT EXISTS idx_lesson_card_packs_lesson ON lesson_card_packs(lesson_id, sort);
CREATE INDEX IF NOT EXISTS idx_lesson_cards_pack ON lesson_cards(pack_id, sort);

-- Saját csomagok, kártya-haladás, könyvtár --------------------------------------
CREATE TABLE IF NOT EXISTS decks (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	kind TEXT NOT NULL DEFAULT 'cards',
	card_kind TEXT NOT NULL DEFAULT 'word',
	subject_id TEXT,
	level_id TEXT,
	material_id TEXT,
	lesson_id TEXT,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS deck_cards (
	id TEXT PRIMARY KEY,
	deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
	front TEXT NOT NULL DEFAULT '',
	back TEXT NOT NULL DEFAULT '',
	sort INTEGER NOT NULL DEFAULT 0,
	section_slug TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS card_progress (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	card_key TEXT NOT NULL,
	known INTEGER NOT NULL DEFAULT 0,
	seen INTEGER NOT NULL DEFAULT 0,
	updated_at TEXT NOT NULL DEFAULT '',
	repetitions INTEGER NOT NULL DEFAULT 0,
	ease REAL NOT NULL DEFAULT 2.5,
	interval_days INTEGER NOT NULL DEFAULT 0,
	due_day INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (user_id, card_key)
);

CREATE TABLE IF NOT EXISTS library (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	quiz_id TEXT NOT NULL,
	added_at INTEGER NOT NULL,
	PRIMARY KEY (user_id, quiz_id)
);

CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id);
CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id, sort);
CREATE INDEX IF NOT EXISTS idx_card_progress_user ON card_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_card_progress_due ON card_progress(user_id, due_day);
CREATE INDEX IF NOT EXISTS idx_library_user ON library(user_id);

-- Tanterem: osztályok, üzenetek, feladatok --------------------------------------
CREATE TABLE IF NOT EXISTS classrooms (
	id TEXT PRIMARY KEY,
	teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	code TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	subject TEXT NOT NULL DEFAULT '',
	description TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS classroom_members (
	classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	joined_at INTEGER NOT NULL,
	PRIMARY KEY (classroom_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
	id TEXT PRIMARY KEY,
	classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
	teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	body TEXT NOT NULL DEFAULT '',
	link_url TEXT,
	ref_type TEXT,
	ref_id TEXT,
	ref_title TEXT,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS classroom_tasks (
	id TEXT PRIMARY KEY,
	classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
	teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title TEXT NOT NULL DEFAULT '',
	lesson_ids_json TEXT NOT NULL DEFAULT '[]',
	question_count INTEGER NOT NULL DEFAULT 10,
	target_pct INTEGER NOT NULL DEFAULT 80,
	shuffle INTEGER NOT NULL DEFAULT 1,
	due_date INTEGER,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_refs (
	message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
	ref_type TEXT NOT NULL,
	ref_id TEXT NOT NULL,
	ref_title TEXT NOT NULL DEFAULT '',
	sort INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (message_id, ref_type, ref_id)
);

CREATE TABLE IF NOT EXISTS task_submissions (
	task_id TEXT NOT NULL REFERENCES classroom_tasks(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	classroom_id TEXT NOT NULL,
	best_score INTEGER NOT NULL DEFAULT 0,
	best_total INTEGER NOT NULL DEFAULT 0,
	best_pct INTEGER NOT NULL DEFAULT 0,
	attempts INTEGER NOT NULL DEFAULT 0,
	submitted INTEGER NOT NULL DEFAULT 0,
	submitted_at INTEGER,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_code ON classrooms(code);
CREATE INDEX IF NOT EXISTS idx_members_user ON classroom_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_class ON messages(classroom_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_refs_message ON message_refs(message_id, sort);
CREATE INDEX IF NOT EXISTS idx_tasks_class ON classroom_tasks(classroom_id, created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_task ON task_submissions(task_id);

-- Beadandók: kiosztás, beküldés, feltöltés ---------------------------------------
CREATE TABLE IF NOT EXISTS classroom_assignments (
	id TEXT PRIMARY KEY,
	classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
	teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title TEXT NOT NULL DEFAULT '',
	description TEXT NOT NULL DEFAULT '',
	due_date INTEGER,
	require_text INTEGER NOT NULL DEFAULT 1,
	min_chars INTEGER NOT NULL DEFAULT 0,
	require_images INTEGER NOT NULL DEFAULT 0,
	max_images INTEGER NOT NULL DEFAULT 3,
	require_files INTEGER NOT NULL DEFAULT 0,
	max_files INTEGER NOT NULL DEFAULT 5,
	require_audio INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
	assignment_id TEXT NOT NULL REFERENCES classroom_assignments(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	classroom_id TEXT NOT NULL,
	text_body TEXT NOT NULL DEFAULT '',
	submitted INTEGER NOT NULL DEFAULT 0,
	submitted_at INTEGER,
	updated_at INTEGER NOT NULL,
	grade INTEGER,
	feedback TEXT NOT NULL DEFAULT '',
	graded_at INTEGER,
	graded_by TEXT,
	PRIMARY KEY (assignment_id, user_id)
);

CREATE TABLE IF NOT EXISTS assignment_uploads (
	id TEXT PRIMARY KEY,
	assignment_id TEXT NOT NULL REFERENCES classroom_assignments(id) ON DELETE CASCADE,
	classroom_id TEXT NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind TEXT NOT NULL DEFAULT 'file',
	r2_key TEXT NOT NULL UNIQUE,
	file_name TEXT NOT NULL DEFAULT '',
	mime TEXT NOT NULL DEFAULT '',
	size INTEGER NOT NULL DEFAULT 0,
	width INTEGER,
	height INTEGER,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assignments_class ON classroom_assignments(classroom_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assignment_subs_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_uploads_lookup
	ON assignment_uploads(assignment_id, user_id, created_at);

-- Biztonság, push, alkalmazás-beállítások -----------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
	token TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	email TEXT NOT NULL,
	code TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	used_at INTEGER,
	attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
	endpoint TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	p256dh TEXT NOT NULL,
	auth TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_config (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_email ON password_reset_tokens(email, created_at);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);


-- Több leckéhez csatolható kártyacsomagok ---------------------------------------
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


-- Tananyag-szerkesztési jogosultságok -------------------------------------------
CREATE TABLE IF NOT EXISTS level_settings (
	level_id TEXT PRIMARY KEY REFERENCES levels(id) ON DELETE CASCADE,
	owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
	published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1))
);

CREATE TABLE IF NOT EXISTS level_editors (
	level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
	email TEXT NOT NULL COLLATE NOCASE,
	PRIMARY KEY (level_id, email)
);

CREATE INDEX IF NOT EXISTS idx_level_editors_email ON level_editors(email);
CREATE INDEX IF NOT EXISTS idx_level_settings_owner ON level_settings(owner_id);

CREATE TABLE IF NOT EXISTS notification_prefs (
	user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	messages INTEGER NOT NULL DEFAULT 1,
	tasks INTEGER NOT NULL DEFAULT 1,
	grades INTEGER NOT NULL DEFAULT 1,
	muted_json TEXT NOT NULL DEFAULT '[]',
	updated_at INTEGER NOT NULL
);

-- Alapadatok: csak tantárgyak, tananyag és felhasználók nélkül.
INSERT OR IGNORE INTO subjects (id, title, icon, level_label, sort, created_at) VALUES
	('subj-angol', 'Angol', 'languages', 'Szint', 0, unixepoch()),
	('subj-nemet', 'Német', 'languages', 'Szint', 1, unixepoch()),
	('subj-olasz', 'Olasz', 'languages', 'Szint', 2, unixepoch()),
	('subj-tortenelem', 'Történelem', 'landmark', 'Évfolyam', 3, unixepoch()),
	('subj-irodalom', 'Irodalom', 'book', 'Évfolyam', 4, unixepoch()),
	('subj-nyelvtan', 'Nyelvtan', 'book', 'Évfolyam', 5, unixepoch()),
	('subj-matematika', 'Matematika', 'calculator', 'Évfolyam', 6, unixepoch());

-- Core séma: Topic -> Lesson -> (elmélet, kártyák, kvíz) + tanári modul + SRS haladás.
-- Minden IF NOT EXISTS: idempotens, élesben és lokálisan is biztonságos.

-- User bővítés (meglévő tábla marad, csak oszlopok jönnek):
-- D1 nem támogatja az ADD COLUMN IF NOT EXISTS-et minden verzióban,
-- ezért az oszlopokat az ensureCoreSchema() is létrehozza új DB-nél,
-- itt pedig sima ADD COLUMN (friss DB-n a users-t az ensure hozza létre a bővített sémával).
-- Régi DB-ken az alábbiak közül a hiányzók egyenként futtathatók.

CREATE TABLE IF NOT EXISTS classrooms (
	id TEXT PRIMARY KEY,
	teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	code TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS classroom_members (
	classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	joined_at INTEGER NOT NULL,
	PRIMARY KEY (classroom_id, user_id)
);

CREATE TABLE IF NOT EXISTS topics (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	category TEXT NOT NULL DEFAULT 'Humán',
	type TEXT NOT NULL DEFAULT 'general',
	is_public INTEGER NOT NULL DEFAULT 1,
	author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
	enrolled_at INTEGER NOT NULL,
	PRIMARY KEY (user_id, topic_id)
);

CREATE TABLE IF NOT EXISTS lessons (
	id TEXT PRIMARY KEY,
	topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
	order_index INTEGER NOT NULL DEFAULT 0,
	title TEXT NOT NULL,
	description_markdown TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS flashcards (
	id TEXT PRIMARY KEY,
	lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
	front_text TEXT NOT NULL,
	back_text TEXT NOT NULL,
	audio_url TEXT,
	image_url TEXT,
	ipa TEXT
);

CREATE TABLE IF NOT EXISTS quiz_questions (
	id TEXT PRIMARY KEY,
	lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
	question_text TEXT NOT NULL,
	type TEXT NOT NULL DEFAULT 'choice',
	options_json TEXT NOT NULL DEFAULT '[]',
	correct_answer TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS user_progress (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	flashcard_id TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
	ease_interval INTEGER NOT NULL DEFAULT 0,
	next_review_date TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL DEFAULT 'new',
	updated_at INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (user_id, flashcard_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
	theory_done INTEGER NOT NULL DEFAULT 0,
	cards_done INTEGER NOT NULL DEFAULT 0,
	quiz_done INTEGER NOT NULL DEFAULT 0,
	quiz_best INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS activity (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	day TEXT NOT NULL,
	xp INTEGER NOT NULL DEFAULT 0,
	reviews INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS assessments (
	id TEXT PRIMARY KEY,
	teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	max_attempts INTEGER NOT NULL DEFAULT 0,
	time_limit_mins INTEGER NOT NULL DEFAULT 0,
	shuffle INTEGER NOT NULL DEFAULT 1,
	feedback_delayed INTEGER NOT NULL DEFAULT 0,
	is_exam INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assessment_items (
	id TEXT PRIMARY KEY,
	assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
	question_text TEXT NOT NULL,
	type TEXT NOT NULL DEFAULT 'choice',
	options_json TEXT NOT NULL DEFAULT '[]',
	correct_answer TEXT NOT NULL DEFAULT '',
	order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assignments (
	id TEXT PRIMARY KEY,
	assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
	classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
	start_date INTEGER NOT NULL DEFAULT 0,
	due_date INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS submissions (
	id TEXT PRIMARY KEY,
	assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
	student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	score INTEGER NOT NULL DEFAULT 0,
	total INTEGER NOT NULL DEFAULT 0,
	started_at INTEGER NOT NULL DEFAULT 0,
	submitted_at INTEGER NOT NULL DEFAULT 0,
	answers_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_lessons_topic ON lessons(topic_id, order_index);
CREATE INDEX IF NOT EXISTS idx_cards_lesson ON flashcards(lesson_id);
CREATE INDEX IF NOT EXISTS idx_quiz_lesson ON quiz_questions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id, next_review_date);
CREATE INDEX IF NOT EXISTS idx_topics_public ON topics(is_public, category);
CREATE INDEX IF NOT EXISTS idx_members_user ON classroom_members(user_id);
CREATE INDEX IF NOT EXISTS idx_assign_class ON assignments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_subm_assign ON submissions(assignment_id, student_id);

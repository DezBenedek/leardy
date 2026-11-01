import type { D1Database } from '@cloudflare/workers-types';
import { cachedEnsure } from '../infra/db';

/**
 * Öngyógyító tanterv-séma a 0001_init migráció alapján:
 * CREATE TABLE/INDEX IF NOT EXISTS: idempotens, minden lekérdezés elején olcsón hívható,
 * így élesben sem dob `no such table` 500-ast, ha a migráció még nincs felvive.
 * A lesson_progress.updated_at INTEGER (unix másodperc).
 * Példányonként cache-elt, állandósult állapotban maroknyi D1-kör.
 */
export async function ensureCurriculumSchema(db: D1Database): Promise<void> {
	return cachedEnsure(db, 'curriculum', () => ensureCurriculumSchemaOnce(db));
}

async function ensureCurriculumSchemaOnce(db: D1Database): Promise<void> {
	await db.batch([
		db.prepare(
			`CREATE TABLE IF NOT EXISTS subjects (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				icon TEXT NOT NULL DEFAULT 'book',
				level_label TEXT NOT NULL DEFAULT 'Tananyag',
				sort INTEGER NOT NULL DEFAULT 0,
				created_at INTEGER NOT NULL
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS levels (
				id TEXT PRIMARY KEY,
				subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
				title TEXT NOT NULL,
				sort INTEGER NOT NULL DEFAULT 0
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS materials (
				id TEXT PRIMARY KEY,
				level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
				title TEXT NOT NULL,
				sort INTEGER NOT NULL DEFAULT 0
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS lessons (
				id TEXT PRIMARY KEY,
				material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
				title TEXT NOT NULL,
				body_md TEXT NOT NULL DEFAULT '',
				content_json TEXT,
				content_revision INTEGER NOT NULL DEFAULT 0,
				sort INTEGER NOT NULL DEFAULT 0
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS quizzes (
				id TEXT PRIMARY KEY,
				lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
				section_slug TEXT NOT NULL DEFAULT '',
				title TEXT NOT NULL,
				sort INTEGER NOT NULL DEFAULT 0
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS quiz_questions (
				id TEXT PRIMARY KEY,
				quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
				question_text TEXT NOT NULL,
				type TEXT NOT NULL DEFAULT 'choice',
				options_json TEXT NOT NULL DEFAULT '[]',
				correct_answer TEXT NOT NULL DEFAULT '',
				section_slug TEXT NOT NULL DEFAULT '',
				sort INTEGER NOT NULL DEFAULT 0
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS lesson_cards (
				id TEXT PRIMARY KEY,
				lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
				section_slug TEXT NOT NULL DEFAULT '',
				front TEXT NOT NULL DEFAULT '',
				back TEXT NOT NULL DEFAULT '',
				sort INTEGER NOT NULL DEFAULT 0
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS lesson_card_packs (
				id TEXT PRIMARY KEY,
				lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
				title TEXT NOT NULL,
				card_kind TEXT NOT NULL DEFAULT 'word',
				sort INTEGER NOT NULL DEFAULT 0
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS lesson_progress (
				user_id INTEGER NOT NULL,
				lesson_id TEXT NOT NULL,
				done INTEGER NOT NULL DEFAULT 0,
				score INTEGER,
				total INTEGER,
				updated_at INTEGER NOT NULL,
				PRIMARY KEY (user_id, lesson_id)
			)`
		),
		db.prepare(`CREATE TABLE IF NOT EXISTS learning_days (
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			day TEXT NOT NULL,
			PRIMARY KEY (user_id, day)
		)`),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS decks (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				title TEXT NOT NULL,
				kind TEXT NOT NULL DEFAULT 'cards',
				card_kind TEXT NOT NULL DEFAULT 'word',
				subject_id TEXT,
				level_id TEXT,
				material_id TEXT,
				lesson_id TEXT,
				is_public INTEGER NOT NULL DEFAULT 0,
				created_at INTEGER NOT NULL
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS deck_cards (
				id TEXT PRIMARY KEY,
				deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
				front TEXT NOT NULL DEFAULT '',
				back TEXT NOT NULL DEFAULT '',
				sort INTEGER NOT NULL DEFAULT 0,
				section_slug TEXT NOT NULL DEFAULT ''
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS deck_lessons (
				deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
				lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
				PRIMARY KEY (deck_id, lesson_id)
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS lesson_card_pack_lessons (
				pack_id TEXT NOT NULL REFERENCES lesson_card_packs(id) ON DELETE CASCADE,
				lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
				PRIMARY KEY (pack_id, lesson_id)
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS card_progress (
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
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS library (
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				quiz_id TEXT NOT NULL,
				added_at INTEGER NOT NULL,
				PRIMARY KEY (user_id, quiz_id)
			)`
		),
		db.prepare(`CREATE TABLE IF NOT EXISTS level_settings (
			level_id TEXT PRIMARY KEY REFERENCES levels(id) ON DELETE CASCADE,
			owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
			published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1))
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS level_editors (
			level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
			email TEXT NOT NULL COLLATE NOCASE,
			PRIMARY KEY (level_id, email)
		)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_level_editors_email ON level_editors(email)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_level_settings_owner ON level_settings(owner_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_levels_subject ON levels(subject_id, sort)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_materials_level ON materials(level_id, sort)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_lessons_material ON lessons(material_id, sort)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_quizzes_lesson ON quizzes(lesson_id, sort)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id, sort)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON lesson_progress(user_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_lesson_cards_lesson ON lesson_cards(lesson_id, sort)`),
		db.prepare(
			`CREATE INDEX IF NOT EXISTS idx_lesson_card_packs_lesson ON lesson_card_packs(lesson_id, sort)`
		),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_lesson_cards_pack ON lesson_cards(pack_id, sort)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id, sort)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_card_progress_user ON card_progress(user_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_card_progress_due ON card_progress(user_id, due_day)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_library_user ON library(user_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_deck_lessons_deck ON deck_lessons(deck_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_deck_lessons_lesson ON deck_lessons(lesson_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_pack_lessons_pack ON lesson_card_pack_lessons(pack_id)`),
		db.prepare(
			`CREATE INDEX IF NOT EXISTS idx_pack_lessons_lesson ON lesson_card_pack_lessons(lesson_id)`
		)
	]);
	// Utólagos oszlopbővítések: egyetlen PRAGMA-batch dönt, állandósult
	// állapotban nulla ALTER-kör. A DDL-párok sorrendje kötött.
	const [decksInfo, packsInfo, questionsInfo, cardsInfo, lessonCardsInfo, subjectsInfo, progressInfo] =
		await db.batch([
			db.prepare(`PRAGMA table_info(decks)`),
			db.prepare(`PRAGMA table_info(lesson_card_packs)`),
			db.prepare(`PRAGMA table_info(quiz_questions)`),
			db.prepare(`PRAGMA table_info(deck_cards)`),
			db.prepare(`PRAGMA table_info(lesson_cards)`),
			db.prepare(`PRAGMA table_info(subjects)`),
			db.prepare(`PRAGMA table_info(card_progress)`)
		]);
	const haveColumns = (result: { results?: unknown }) =>
		new Set(((result.results ?? []) as { name: string }[]).map((column) => column.name));
	const have = [
		haveColumns(decksInfo),
		haveColumns(packsInfo),
		haveColumns(questionsInfo),
		haveColumns(cardsInfo),
		haveColumns(lessonCardsInfo),
		haveColumns(subjectsInfo),
		haveColumns(progressInfo)
	];
	const additions: [number, string, string][] = [
		[0, 'kind', `ALTER TABLE decks ADD COLUMN kind TEXT NOT NULL DEFAULT 'cards'`],
		[0, 'card_kind', `ALTER TABLE decks ADD COLUMN card_kind TEXT NOT NULL DEFAULT 'word'`],
		[1, 'card_kind', `ALTER TABLE lesson_card_packs ADD COLUMN card_kind TEXT NOT NULL DEFAULT 'word'`],
		[0, 'material_id', `ALTER TABLE decks ADD COLUMN material_id TEXT`],
		[0, 'lesson_id', `ALTER TABLE decks ADD COLUMN lesson_id TEXT`],
		[0, 'is_public', `ALTER TABLE decks ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`],
		[2, 'section_slug', `ALTER TABLE quiz_questions ADD COLUMN section_slug TEXT NOT NULL DEFAULT ''`],
		[3, 'section_slug', `ALTER TABLE deck_cards ADD COLUMN section_slug TEXT NOT NULL DEFAULT ''`],
		[4, 'pack_id', `ALTER TABLE lesson_cards ADD COLUMN pack_id TEXT`],
		[5, 'level_label', `ALTER TABLE subjects ADD COLUMN level_label TEXT NOT NULL DEFAULT 'Tananyag'`],
		[6, 'repetitions', `ALTER TABLE card_progress ADD COLUMN repetitions INTEGER NOT NULL DEFAULT 0`],
		[6, 'ease', `ALTER TABLE card_progress ADD COLUMN ease REAL NOT NULL DEFAULT 2.5`],
		[6, 'interval_days', `ALTER TABLE card_progress ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 0`],
		[6, 'due_day', `ALTER TABLE card_progress ADD COLUMN due_day INTEGER NOT NULL DEFAULT 0`],
		[0, 'is_lesson', `ALTER TABLE decks ADD COLUMN is_lesson INTEGER NOT NULL DEFAULT 0`],
		[0, 'created_by', `ALTER TABLE decks ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL`]
	];
	for (const [table, column, ddl] of additions) {
		if (have[table].has(column)) continue;
		try {
			await db.prepare(ddl).run();
		} catch {
			// az oszlop már létezik
		}
	}
	// Több leckéhez csatolás: kapcsolótáblák. A régi egy-leckés
	// `lesson_id` megmarad elsődlegesnek, a kapcsoló az összes csatolást tartja.
	// A sort-ALTER a CREATE után jön, különben friss DB-n sosem futna le.
	for (const ddl of [
		`CREATE TABLE IF NOT EXISTS deck_lessons (
			deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
			lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
			PRIMARY KEY (deck_id, lesson_id)
		)`,
		`CREATE TABLE IF NOT EXISTS lesson_card_pack_lessons (
			pack_id TEXT NOT NULL REFERENCES lesson_card_packs(id) ON DELETE CASCADE,
			lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
			PRIMARY KEY (pack_id, lesson_id)
		)`,
		`ALTER TABLE deck_lessons ADD COLUMN sort INTEGER NOT NULL DEFAULT 0`,
		`CREATE INDEX IF NOT EXISTS idx_decks_public ON decks(is_public)`,
		`CREATE INDEX IF NOT EXISTS idx_decks_lesson_flag ON decks(is_lesson)`,
		`CREATE INDEX IF NOT EXISTS idx_deck_lessons_lesson_sort ON deck_lessons(lesson_id, sort)`
	]) {
		try {
			await db.prepare(ddl).run();
		} catch {
			// már létezik
		}
	}
	// Régi egy-leckés csatolások átmentése a kapcsolóba (idempotens).
	try {
		await db
			.prepare(
				`INSERT OR IGNORE INTO deck_lessons (deck_id, lesson_id)
				 SELECT id, lesson_id FROM decks WHERE lesson_id IS NOT NULL AND TRIM(lesson_id) != ''`
			)
			.run();
	} catch {
		// tábla még nincs vagy nincs mit menteni
	}
	try {
		await db
			.prepare(
				`INSERT OR IGNORE INTO lesson_card_pack_lessons (pack_id, lesson_id)
				 SELECT id, lesson_id FROM lesson_card_packs WHERE lesson_id IS NOT NULL AND TRIM(lesson_id) != ''`
			)
			.run();
	} catch {
		// tábla még nincs vagy nincs mit menteni
	}
	// Hivatalos lecke deckek jelölése és létrehozója: az ALTER-ek és az
	// indexek már fentebb, a PRAGMA-alapú bővítésben és a kapcsoló-blokkban vannak.
	// Rendszerfelhasználó a hivatalos deckek tulajdonosának (soha nem jelentkezik be).
	try {
		await db
			.prepare(
				`INSERT OR IGNORE INTO users (id, name, email, pass_hash, salt, created_at, role)
				 VALUES ('system', 'Leardy tananyag', 'system@local.invalid', 'system', '', 0, 'teacher')`
			)
			.run();
	} catch {
		// a users tábla még nem áll készen
	}
}

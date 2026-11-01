import type { D1Database } from '@cloudflare/workers-types';

/**
 * Öngyógyító tanterv-séma a 0001_init migráció alapján:
 * CREATE TABLE/INDEX IF NOT EXISTS: idempotens, minden lekérdezés elején olcsón hívható,
 * így élesben sem dob `no such table` 500-ast, ha a migráció még nincs felvive.
 * A lesson_progress.updated_at INTEGER (unix másodperc).
 */
export async function ensureCurriculumSchema(db: D1Database): Promise<void> {
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
	// Régebbi decks táblák utólagos bővítése kind-nal. Ha már létezik, a hiba elnyelhető.
	try {
		await db.prepare(`ALTER TABLE decks ADD COLUMN kind TEXT NOT NULL DEFAULT 'cards'`).run();
	} catch {
		// az oszlop már létezik
	}
	// Kártyacsomag típusa: Szókártya (word) vagy Tanulókártya (study).
	try {
		await db.prepare(`ALTER TABLE decks ADD COLUMN card_kind TEXT NOT NULL DEFAULT 'word'`).run();
	} catch {
		// az oszlop már létezik
	}
	try {
		await db
			.prepare(`ALTER TABLE lesson_card_packs ADD COLUMN card_kind TEXT NOT NULL DEFAULT 'word'`)
			.run();
	} catch {
		// az oszlop már létezik
	}
	// Csatolás témakörhöz/leckéhez, ugyanígy utólagos bővítés.
	for (const col of ['material_id', 'lesson_id']) {
		try {
			await db.prepare(`ALTER TABLE decks ADD COLUMN ${col} TEXT`).run();
		} catch {
			// az oszlop már létezik
		}
	}
	// Publikálás: tanári csomag mindenkinek látszódhat (Felfedezés + csatolt lecke).
	try {
		await db.prepare(`ALTER TABLE decks ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`).run();
	} catch {
		// az oszlop már létezik
	}
	try {
		await db.prepare(`CREATE INDEX IF NOT EXISTS idx_decks_public ON decks(is_public)`).run();
	} catch {
		// az index már létezik
	}
	// Kérdés bekezdéshez (szekcióhoz) sorolása, utólagos bővítés.
	try {
		await db.prepare(`ALTER TABLE quiz_questions ADD COLUMN section_slug TEXT NOT NULL DEFAULT ''`).run();
	} catch {
		// az oszlop már létezik
	}
	// Kártya bekezdéshez (szekcióhoz) sorolása, utólagos bővítés.
	try {
		await db.prepare(`ALTER TABLE deck_cards ADD COLUMN section_slug TEXT NOT NULL DEFAULT ''`).run();
	} catch {
		// az oszlop már létezik
	}
	// Hivatalos kártyacsomaghoz sorolás (több csomag leckénként), utólagos bővítés.
	try {
		await db.prepare(`ALTER TABLE lesson_cards ADD COLUMN pack_id TEXT`).run();
	} catch {
		// az oszlop már létezik
	}
	// A tananyagválasztó címkéjének utólagos bővítése.
	try {
		await db.prepare(`ALTER TABLE subjects ADD COLUMN level_label TEXT NOT NULL DEFAULT 'Tananyag'`).run();
	} catch {
		// az oszlop már létezik
	}
	// SM-2 ütemezés a meglévő card_progress sorokban, új tábla nélkül.
	// Csak a megérintett kártyához jön létre sor, ezért sor takarékos marad.
	for (const ddl of [
		`ALTER TABLE card_progress ADD COLUMN repetitions INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE card_progress ADD COLUMN ease REAL NOT NULL DEFAULT 2.5`,
		`ALTER TABLE card_progress ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE card_progress ADD COLUMN due_day INTEGER NOT NULL DEFAULT 0`
	]) {
		try {
			await db.prepare(ddl).run();
		} catch {
			// az oszlop már létezik
		}
	}
	// Több leckéhez csatolás: kapcsolótáblák. A régi egy-leckés
	// `lesson_id` megmarad elsődlegesnek, a kapcsoló az összes csatolást tartja.
	try {
		await db
			.prepare(
				`CREATE TABLE IF NOT EXISTS deck_lessons (
					deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
					lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
					PRIMARY KEY (deck_id, lesson_id)
				)`
			)
			.run();
	} catch {
		// már létezik
	}
	try {
		await db
			.prepare(
				`CREATE TABLE IF NOT EXISTS lesson_card_pack_lessons (
					pack_id TEXT NOT NULL REFERENCES lesson_card_packs(id) ON DELETE CASCADE,
					lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
					PRIMARY KEY (pack_id, lesson_id)
				)`
			)
			.run();
	} catch {
		// már létezik
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
}

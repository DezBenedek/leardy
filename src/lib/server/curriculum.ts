/* Szerveroldali tanterv-lekérdezések D1-re (Svelte 5 runes nem kell szerveroldalra).
   Típusszerződés: $lib/curriculum. Függőség: csak D1. */
import type { D1Database } from '@cloudflare/workers-types';
import type { RequestEvent } from '@sveltejs/kit';
import { getDb } from './db';
import type {
	HomeStats,
	LessonPage,
	MaterialNode,
	Package,
	Quiz,
	QuizPair,
	QuizQuestion,
	Subject,
	SubjectTree,
	Suggestion
} from '$lib/curriculum';
import { gradeSM2, todayDay } from '$lib/sm2';

/** A lekérdezők D1Database-et vagy RequestEvent-et fogadnak első paramként;
 *  event esetén getDb-vel (./db) oldják fel az adatbázist. */
type DbOrEvent = D1Database | RequestEvent;

function resolveDb(dbOrEvent: DbOrEvent): D1Database {
	if (typeof (dbOrEvent as D1Database).prepare === 'function') return dbOrEvent as D1Database;
	const db = getDb(dbOrEvent as RequestEvent);
	if (!db) throw new Error('Az adatbázis most nem elérhető.');
	return db;
}

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
				level_label TEXT NOT NULL DEFAULT 'Szint',
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
	// Tantárgyankénti szint-címke ("Szint", "Évfolyam", ...), utólagos bővítés.
	try {
		await db.prepare(`ALTER TABLE subjects ADD COLUMN level_label TEXT NOT NULL DEFAULT 'Szint'`).run();
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

/** Csatolt leckék egy saját csomaghoz: kapcsoló + régi oszlop uniója. */
async function deckAttachedLessons(
	db: D1Database,
	deckId: string
): Promise<{ id: string; title: string }[]> {
	const ids = new Set<string>();
	try {
		const r = await db
			.prepare(`SELECT lesson_id AS id FROM deck_lessons WHERE deck_id = ?`)
			.bind(deckId)
			.all<{ id: string }>();
		for (const row of r.results ?? []) if (row.id) ids.add(row.id);
	} catch {
		// kapcsoló még nincs
	}
	try {
		const legacy = await db
			.prepare(`SELECT lesson_id AS id FROM decks WHERE id = ?`)
			.bind(deckId)
			.first<{ id: string | null }>();
		if (legacy?.id) ids.add(legacy.id);
	} catch {
		// nincs régi oszlop
	}
	if (ids.size === 0) return [];
	try {
		const list = [...ids];
		const res = await db
			.prepare(`SELECT id, title FROM lessons WHERE id IN (${list.map(() => '?').join(', ')})`)
			.bind(...list)
			.all<{ id: string; title: string }>();
		const byId = new Map((res.results ?? []).map((l) => [l.id, l.title]));
		return list
			.filter((id) => byId.has(id))
			.map((id) => ({ id, title: byId.get(id) ?? '' }));
	} catch {
		return [...ids].map((id) => ({ id, title: '' }));
	}
}

/** Csatolt leckék egy hivatalos csomaghoz: kapcsoló + régi oszlop uniója. */
async function packAttachedLessons(
	db: D1Database,
	packId: string
): Promise<{ id: string; title: string }[]> {
	const ids = new Set<string>();
	try {
		const r = await db
			.prepare(`SELECT lesson_id AS id FROM lesson_card_pack_lessons WHERE pack_id = ?`)
			.bind(packId)
			.all<{ id: string }>();
		for (const row of r.results ?? []) if (row.id) ids.add(row.id);
	} catch {
		// kapcsoló még nincs
	}
	try {
		const legacy = await db
			.prepare(`SELECT lesson_id AS id FROM lesson_card_packs WHERE id = ?`)
			.bind(packId)
			.first<{ id: string | null }>();
		if (legacy?.id) ids.add(legacy.id);
	} catch {
		// nincs régi oszlop
	}
	if (ids.size === 0) return [];
	try {
		const list = [...ids];
		const res = await db
			.prepare(`SELECT id, title FROM lessons WHERE id IN (${list.map(() => '?').join(', ')})`)
			.bind(...list)
			.all<{ id: string; title: string }>();
		const byId = new Map((res.results ?? []).map((l) => [l.id, l.title]));
		return list
			.filter((id) => byId.has(id))
			.map((id) => ({ id, title: byId.get(id) ?? '' }));
	} catch {
		return [...ids].map((id) => ({ id, title: '' }));
	}
}

/** Saját csomag csatolásainak cseréje: kapcsoló újraírva, régi oszlop az elsőre áll. */
export async function setDeckLessons(
	db: D1Database,
	deckId: string,
	lessonIds: string[]
): Promise<void> {
	const uniq = [...new Set(lessonIds.map((s) => s.trim()).filter(Boolean))].slice(0, 50);
	try {
		await db.prepare(`DELETE FROM deck_lessons WHERE deck_id = ?`).bind(deckId).run();
	} catch {
		// kapcsoló még nincs
	}
	if (uniq.length > 0) {
		try {
			await db.batch(
				uniq.map((lid) =>
					db
						.prepare(`INSERT OR IGNORE INTO deck_lessons (deck_id, lesson_id) VALUES (?, ?)`)
						.bind(deckId, lid)
				)
			);
		} catch {
			// egyedi írásokkal próbálkozunk
			for (const lid of uniq) {
				try {
					await db
						.prepare(`INSERT OR IGNORE INTO deck_lessons (deck_id, lesson_id) VALUES (?, ?)`)
						.bind(deckId, lid)
						.run();
				} catch {
					// egy hibás csatolás nem blokkol
				}
			}
		}
	}
	try {
		await db.prepare(`UPDATE decks SET lesson_id = ? WHERE id = ?`).bind(uniq[0] ?? null, deckId).run();
	} catch {
		// régi oszlop nélkül is jó a kapcsoló
	}
}

/** Hivatalos csomag csatolásainak cseréje (admin/seed rétegnek). */
export async function setPackLessons(
	db: D1Database,
	packId: string,
	lessonIds: string[]
): Promise<void> {
	const uniq = [...new Set(lessonIds.map((s) => s.trim()).filter(Boolean))].slice(0, 50);
	try {
		await db.prepare(`DELETE FROM lesson_card_pack_lessons WHERE pack_id = ?`).bind(packId).run();
	} catch {
		// kapcsoló még nincs
	}
	if (uniq.length > 0) {
		try {
			await db.batch(
				uniq.map((lid) =>
					db
						.prepare(
							`INSERT OR IGNORE INTO lesson_card_pack_lessons (pack_id, lesson_id) VALUES (?, ?)`
						)
						.bind(packId, lid)
				)
			);
		} catch {
			for (const lid of uniq) {
				try {
					await db
						.prepare(
							`INSERT OR IGNORE INTO lesson_card_pack_lessons (pack_id, lesson_id) VALUES (?, ?)`
						)
						.bind(packId, lid)
						.run();
				} catch {
					// egy hibás csatolás nem blokkol
				}
			}
		}
	}
	// Az elsődleges lecke marad a régi oszlopban, hogy a JOIN-ok működjenek.
	try {
		if (uniq.length > 0) {
			await db.prepare(`UPDATE lesson_card_packs SET lesson_id = ? WHERE id = ?`).bind(uniq[0], packId).run();
		}
	} catch {
		// régi oszlop nélkül is jó a kapcsoló
	}
}

/** Kötegelt csatolás-térkép hivatalos csomagokhoz (packId -> leckék). */
async function packMultiMap(
	db: D1Database,
	packIds: string[]
): Promise<Map<string, { id: string; title: string }[]>> {
	const out = new Map<string, { id: string; title: string }[]>();
	if (packIds.length === 0) return out;
	try {
		const res = await db
			.prepare(
				`SELECT pl.pack_id AS packId, le.id AS id, le.title AS title
				 FROM lesson_card_pack_lessons pl
				 JOIN lessons le ON le.id = pl.lesson_id
				 WHERE pl.pack_id IN (${packIds.map(() => '?').join(', ')})`
			)
			.bind(...packIds)
			.all<{ packId: string; id: string; title: string }>();
		for (const r of res.results ?? []) {
			const list = out.get(r.packId) ?? [];
			if (!list.some((x) => x.id === r.id)) list.push({ id: r.id, title: r.title });
			out.set(r.packId, list);
		}
	} catch {
		// kapcsoló még nincs: üres térkép
	}
	return out;
}

/** Kötegelt csatolás-térkép saját csomagokhoz (deckId -> leckék). */
async function deckMultiMap(
	db: D1Database,
	deckIds: string[]
): Promise<Map<string, { id: string; title: string }[]>> {
	const out = new Map<string, { id: string; title: string }[]>();
	if (deckIds.length === 0) return out;
	try {
		const res = await db
			.prepare(
				`SELECT dl.deck_id AS deckId, le.id AS id, le.title AS title
				 FROM deck_lessons dl
				 JOIN lessons le ON le.id = dl.lesson_id
				 WHERE dl.deck_id IN (${deckIds.map(() => '?').join(', ')})`
			)
			.bind(...deckIds)
			.all<{ deckId: string; id: string; title: string }>();
		for (const r of res.results ?? []) {
			const list = out.get(r.deckId) ?? [];
			if (!list.some((x) => x.id === r.id)) list.push({ id: r.id, title: r.title });
			out.set(r.deckId, list);
		}
	} catch {
		// kapcsoló még nincs
	}
	return out;
}

interface SubjectRow {
	id: string;
	title: string;
	icon: string;
	sort: number;
	levelLabel: string;
}

export async function listSubjects(dbOrEvent: DbOrEvent): Promise<Subject[]> {
	const db = resolveDb(dbOrEvent);
	// Nincs ensure: az olvasást nem blokkoljuk ~25 DDL-lel (migrációk + író API-k biztosítják).
	// D1-optimalizálás: a korábbi korrelált COUNT-allekérdezések minden tantárgyra
	// újraolvasták a levels/materials/lessons táblákat (N * teljes scan).
	// Helyette 1 batchelt körben: tantárgyak + 3 GROUP BY számlálás.
	const [subjectsRes, levelCountRes, lessonCountRes, packCountRes] = await db.batch([
		db.prepare(
			`SELECT id, title, COALESCE(icon, 'book') AS icon, COALESCE(sort, 0) AS sort,
				COALESCE(level_label, 'Szint') AS levelLabel
				FROM subjects
				ORDER BY sort, title`
		),
		db.prepare(`SELECT subject_id AS id, COUNT(*) AS n FROM levels GROUP BY subject_id`),
		// Leckeszám: csak a tartalmas leckék (szöveg vagy kvíz). Az üres
		// szókártya-hordozók nem számítanak bele, hogy a szám őszinte maradjon.
		db.prepare(
			`SELECT l.subject_id AS id, COUNT(DISTINCT le.id) AS n FROM lessons le
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id
				 LEFT JOIN quizzes q ON q.lesson_id = le.id
				 WHERE TRIM(COALESCE(le.body_md, '')) != '' OR q.id IS NOT NULL
				 GROUP BY l.subject_id`
		),
		// Csomagszám: kártyát tartalmazó hivatalos csomagok tantárgyanként.
		db.prepare(
			`SELECT s.id AS id, COUNT(DISTINCT p.id) AS n FROM lesson_card_packs p
				 JOIN lessons le ON le.id = p.lesson_id
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id
				 JOIN subjects s ON s.id = l.subject_id
				 JOIN lesson_cards c ON c.pack_id = p.id
				 GROUP BY s.id`
		)
	]);
	const subjects = (subjectsRes as unknown as { results: SubjectRow[] }).results ?? [];
	const levelCounts = new Map<string, number>();
	for (const r of (levelCountRes as unknown as { results: { id: string; n: number }[] })
		.results ?? [])
		levelCounts.set(r.id, r.n ?? 0);
	const lessonCounts = new Map<string, number>();
	for (const r of (lessonCountRes as unknown as { results: { id: string; n: number }[] })
		.results ?? [])
		lessonCounts.set(r.id, r.n ?? 0);
	const packCounts = new Map<string, number>();
	for (const r of (packCountRes as unknown as { results: { id: string; n: number }[] })
		.results ?? [])
		packCounts.set(r.id, r.n ?? 0);
	return subjects.map((r) => ({
		id: r.id,
		title: r.title,
		icon: r.icon ?? 'book',
		sort: r.sort ?? 0,
		levelCount: levelCounts.get(r.id) ?? 0,
		lessonCount: lessonCounts.get(r.id) ?? 0,
		packCount: packCounts.get(r.id) ?? 0,
		levelLabel: r.levelLabel || 'Szint'
	}));
}

/** Kvízszám leckénként ({ [lessonId]: darab }), adott tantárgyra szűkítve is.
    A választók onlyWithQuiz szűréséhez. */
export async function countQuizzesByLesson(
	dbOrEvent: DbOrEvent,
	subjectId?: string
): Promise<Record<string, number>> {
	const db = resolveDb(dbOrEvent);
	if (!db) return {};
	const base = `SELECT q.lesson_id AS id, COUNT(*) AS n FROM quizzes q`;
	const scoped = `${base}
		JOIN lessons le ON le.id = q.lesson_id
		JOIN materials m ON m.id = le.material_id
		JOIN levels l ON l.id = m.level_id
		WHERE l.subject_id = ? GROUP BY q.lesson_id`;
	const res = subjectId
		? await db.prepare(scoped).bind(subjectId).all<{ id: string; n: number }>()
		: await db.prepare(`${base} GROUP BY q.lesson_id`).all<{ id: string; n: number }>();
	const out: Record<string, number> = {};
	for (const r of res.results ?? []) out[r.id] = r.n ?? 0;
	return out;
}

/** Kvízszám tantárgyanként ({ [subjectId]: darab }) a tantárgy-lista szűréséhez. */
export async function countQuizzesBySubject(dbOrEvent: DbOrEvent): Promise<Record<string, number>> {
	const db = resolveDb(dbOrEvent);
	if (!db) return {};
	const res = await db
		.prepare(
			`SELECT l.subject_id AS id, COUNT(*) AS n FROM quizzes q
			 JOIN lessons le ON le.id = q.lesson_id
			 JOIN materials m ON m.id = le.material_id
			 JOIN levels l ON l.id = m.level_id
			 GROUP BY l.subject_id`
		)
		.all<{ id: string; n: number }>();
	const out: Record<string, number> = {};
	for (const r of res.results ?? []) out[r.id] = r.n ?? 0;
	return out;
}

interface LevelRow {
	id: string;
	title: string;
	sort: number;
}
interface MaterialRow {
	id: string;
	level_id: string;
	title: string;
	sort: number;
}
interface LessonRefRow {
	id: string;
	material_id: string;
	title: string;
	sort: number;
	bodyLen: number;
}

export async function getSubjectTree(
	dbOrEvent: DbOrEvent,
	subjectId: string,
	userId?: string | number | null
): Promise<SubjectTree | null> {
	const db = resolveDb(dbOrEvent);
	// Nincs ensure: olvasást nem blokkolunk DDL-lel.
	// D1-optimalizálás: a 4 független olvasás 1 batchelt körben fut
	// (eddig 1 + 1 batch(3) + 1 = 3 kör volt).
	const [subjectRes, levelsRes, materialsRes, lessonsRes, quizCountRes, packCountRes] = await db.batch([
		db
			.prepare(
				`SELECT id, title, COALESCE(icon, 'book') AS icon, COALESCE(sort, 0) AS sort,
				COALESCE(level_label, 'Szint') AS levelLabel FROM subjects WHERE id = ?`
			)
			.bind(subjectId),
		db
			.prepare(
				`SELECT id, title, COALESCE(sort, 0) AS sort FROM levels WHERE subject_id = ? ORDER BY sort, title`
			)
			.bind(subjectId),
		db
			.prepare(
				`SELECT m.id, m.level_id, m.title, COALESCE(m.sort, 0) AS sort
				 FROM materials m JOIN levels l ON l.id = m.level_id
				 WHERE l.subject_id = ? ORDER BY m.sort, m.title`
			)
			.bind(subjectId),
		db
			.prepare(
				`SELECT le.id, le.material_id, le.title, COALESCE(le.sort, 0) AS sort,
					LENGTH(TRIM(COALESCE(le.body_md, ''))) AS bodyLen
				 FROM lessons le
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id
				 WHERE l.subject_id = ? ORDER BY le.sort, le.title`
			)
			.bind(subjectId),
		db
			.prepare(
				`SELECT q.lesson_id AS id, COUNT(*) AS n FROM quizzes q
				 JOIN lessons le ON le.id = q.lesson_id
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id
				 WHERE l.subject_id = ? GROUP BY q.lesson_id`
			)
			.bind(subjectId),
		db
			.prepare(
				`SELECT COUNT(DISTINCT p.id) AS n FROM lesson_card_packs p
				 JOIN lessons le ON le.id = p.lesson_id
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id
				 JOIN lesson_cards c ON c.pack_id = p.id
				 WHERE l.subject_id = ?`
			)
			.bind(subjectId)
	]);
	const subject = (
		subjectRes as unknown as {
			results: { id: string; title: string; icon: string; sort: number; levelLabel: string }[];
		}
	).results?.[0];
	if (!subject) return null;
	const levels = (levelsRes as unknown as { results: LevelRow[] }).results ?? [];
	const materials = (materialsRes as unknown as { results: MaterialRow[] }).results ?? [];
	const allLessons = (lessonsRes as unknown as { results: LessonRefRow[] }).results ?? [];
	// Csak tartalmas lecke látszik: szöveges leírás vagy legalább egy kvíz kell.
	// A puszta szókártya-hordozó leckék (üres szöveg, kvíz nélkül) nem kellenek sehova.
	const quizCounts = new Map<string, number>();
	for (const r of (quizCountRes as unknown as { results: { id: string; n: number }[] }).results ?? []) {
		quizCounts.set(r.id, r.n ?? 0);
	}
	const lessons = allLessons.filter((le) => (le.bodyLen ?? 0) > 0 || (quizCounts.get(le.id) ?? 0) > 0);

	/** Teljesített leckék, csak bejelentkezve. D1-optimalizálás: csak az adott
	 *  tantárgy leckéire szűrve (eddig a user ÖSSZES haladása lejött). */
	let doneIds = new Set<string>();
	if (userId !== undefined && userId !== null && userId !== '') {
		try {
			const doneRes = await db
				.prepare(
					`SELECT p.lesson_id AS id FROM lesson_progress p
					 JOIN lessons le ON le.id = p.lesson_id
					 JOIN materials m ON m.id = le.material_id
					 JOIN levels l ON l.id = m.level_id
					 WHERE p.user_id = ? AND p.done = 1 AND l.subject_id = ?`
				)
				.bind(userId, subjectId)
				.all<{ id: string }>();
			for (const r of doneRes.results ?? []) doneIds.add(r.id);
		} catch {
			// haladás nélkül is megy
		}
	}

	const lessonsByMaterial = new Map<string, { id: string; title: string; sort: number; done: boolean }[]>();
	for (const le of lessons) {
		const list = lessonsByMaterial.get(le.material_id) ?? [];
		list.push({ id: le.id, title: le.title, sort: le.sort ?? 0, done: doneIds.has(le.id) });
		lessonsByMaterial.set(le.material_id, list);
	}
	const materialsByLevel = new Map<string, MaterialNode[]>();
	for (const m of materials) {
		const list = materialsByLevel.get(m.level_id) ?? [];
		list.push({
			id: m.id,
			title: m.title,
			sort: m.sort ?? 0,
			lessons: lessonsByMaterial.get(m.id) ?? []
		});
		materialsByLevel.set(m.level_id, list);
	}

	const levelNodes = levels.map((l) => ({
		id: l.id,
		title: l.title,
		sort: l.sort ?? 0,
		materials: materialsByLevel.get(l.id) ?? []
	}));
	const lessonCount = levelNodes.reduce(
		(n, l) => n + l.materials.reduce((m, mat) => m + mat.lessons.length, 0),
		0
	);

	return {
		id: subject.id,
		title: subject.title,
		icon: subject.icon ?? 'book',
		sort: subject.sort ?? 0,
		levelLabel: subject.levelLabel || 'Szint',
		levelCount: levelNodes.length,
		lessonCount,
		packCount:
			(packCountRes as unknown as { results: { n: number }[] }).results?.[0]?.n ?? 0,
		levels: levelNodes
	};
}

interface QuizRow {
	id: string;
	title: string;
	section_slug: string;
	sort: number;
}
interface QuestionRow {
	id: string;
	quiz_id: string;
	question_text: string;
	type: string;
	options_json: string;
	correct_answer: string;
}

function parseQuestion(row: QuestionRow): QuizQuestion {
	let options: string[] = [];
	let pairs: QuizPair[] = [];
	try {
		const parsed: unknown = JSON.parse(row.options_json ?? '[]');
		if (Array.isArray(parsed)) {
			options = parsed.map((v) => String(v));
		} else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { pairs?: unknown }).pairs)) {
			const rawPairs = (parsed as { pairs: unknown[] }).pairs;
			pairs = rawPairs
				.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
				.map((p) => ({ left: String(p.left ?? ''), right: String(p.right ?? '') }));
		}
	} catch {
		// hibás JSON → üres options/pairs
	}
	return {
		id: row.id,
		question_text: row.question_text,
		type: row.type ?? 'choice',
		options,
		pairs,
		correct_answer: row.correct_answer ?? ''
	};
}

export async function getLessonPage(
	dbOrEvent: DbOrEvent,
	lessonId: string
): Promise<LessonPage | null> {
	const db = resolveDb(dbOrEvent);
	// Nincs ensure: olvasást nem blokkolunk DDL-lel.
	// D1-optimalizálás: lecke + kvízlista 1 batchelt körben (eddig 2 kör volt).
	const [lessonRes, quizzesRes] = await db.batch([
		db
			.prepare(
				`SELECT le.id, le.title, COALESCE(le.body_md, '') AS body_md,
				m.id AS material_id, m.title AS material_title,
				l.id AS level_id, l.title AS level_title,
				s.id AS subject_id, s.title AS subject_title
			 FROM lessons le
			 JOIN materials m ON m.id = le.material_id
			 JOIN levels l ON l.id = m.level_id
			 JOIN subjects s ON s.id = l.subject_id
			 WHERE le.id = ?`
			)
			.bind(lessonId),
		db
			.prepare(
				`SELECT id, title, COALESCE(section_slug, '') AS section_slug, COALESCE(sort, 0) AS sort
			 FROM quizzes WHERE lesson_id = ? ORDER BY sort, title`
			)
			.bind(lessonId)
	]);
	const lesson = (
		lessonRes as unknown as {
			results: {
				id: string;
				title: string;
				body_md: string;
				material_id: string;
				material_title: string;
				level_id: string;
				level_title: string;
				subject_id: string;
				subject_title: string;
			}[];
		}
	).results?.[0];
	if (!lesson) return null;

	const quizRows =
		(quizzesRes as unknown as { results: QuizRow[] }).results ?? [];

	const questionsRes =
		quizRows.length === 0
			? { results: [] as QuestionRow[] }
			: await db
					.prepare(
						`SELECT id, quiz_id, question_text, COALESCE(type, 'choice') AS type,
							COALESCE(options_json, '[]') AS options_json,
							COALESCE(correct_answer, '') AS correct_answer
						 FROM quiz_questions WHERE quiz_id IN (${quizRows.map(() => '?').join(', ')})
						 ORDER BY sort, id`
					)
					.bind(...quizRows.map((q) => q.id))
					.all<QuestionRow>();
	const questionsByQuiz = new Map<string, QuizQuestion[]>();
	for (const row of questionsRes.results ?? []) {
		const list = questionsByQuiz.get(row.quiz_id) ?? [];
		list.push(parseQuestion(row));
		questionsByQuiz.set(row.quiz_id, list);
	}

	const quizzes: Quiz[] = quizRows.map((q) => ({
		id: q.id,
		title: q.title,
		section_slug: q.section_slug ?? '',
		questions: questionsByQuiz.get(q.id) ?? []
	}));

	return {
		lesson: { id: lesson.id, title: lesson.title, body_md: lesson.body_md ?? '' },
		material: { id: lesson.material_id, title: lesson.material_title },
		level: { id: lesson.level_id, title: lesson.level_title },
		subject: { id: lesson.subject_id, title: lesson.subject_title },
		quizzes
	};
}

export async function saveLessonProgress(
	db: D1Database,
	userId: string | number,
	lessonId: string,
	done: boolean | number,
	score: number | null,
	total: number | null
): Promise<void> {
	// Nincs ensure: a sémát a migrációk biztosítják (a DDL minden írásnál
	// több tucat felesleges D1-művelet lenne).
	await db
		.prepare(
			`INSERT OR REPLACE INTO lesson_progress (user_id, lesson_id, done, score, total, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(userId, lessonId, done ? 1 : 0, score, total, Math.floor(Date.now() / 1000))
		.run();
}

/** Europe/Budapest szerinti naptári nap (YYYY-MM-DD) egy időbélyeghez. */
function budapestDay(timestampMs: number): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Budapest',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(timestampMs));
}

/** Naptári nap mínusz n nap (YYYY-MM-DD aritmetika, DST-biztos). */
function prevCalendarDay(ymd: string): string {
	const [y, m, d] = ymd.split('-').map(Number);
	const t = Date.UTC(y, m - 1, d) - 86400000;
	const dt = new Date(t);
	const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(dt.getUTCDate()).padStart(2, '0');
	return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

/** Az updated_at lehet unix másodperc (új) vagy ms (régi adat), mindkettőt kezeljük. */
function progressToMs(value: number): number {
	return value > 1e11 ? value : value * 1000;
}

export async function getHomeStats(
	dbOrEvent: DbOrEvent,
	userId: string | number
): Promise<HomeStats> {
	const db = resolveDb(dbOrEvent);
	// D1-optimalizálás: csak a szükséges 2 oszlop, felső korláttal.
	// A streakhez az elmúlt ~2 év napjai elégnek, a nagyon régi sorokat nem olvassuk.
	const res = await db
		.prepare(`SELECT done, updated_at FROM lesson_progress WHERE user_id = ? LIMIT 5000`)
		.bind(userId)
		.all<{ done: number; updated_at: number }>();
	const rows = res.results ?? [];
	const today = budapestDay(Date.now());
	const activeDays = new Set<string>();
	let todayDone = 0;
	for (const r of rows) {
		const day = budapestDay(progressToMs(Number(r.updated_at)));
		activeDays.add(day);
		if (Number(r.done) === 1 && day === today) todayDone++;
	}
	// A streak ma vagy tegnap indul (ha ma még nincs aktivitás, a tegnap számít).
	let cursor = activeDays.has(today) ? today : prevCalendarDay(today);
	let streak = 0;
	while (activeDays.has(cursor)) {
		streak++;
		cursor = prevCalendarDay(cursor);
	}
	return { streak, todayDone };
}

export async function getSuggestions(
	dbOrEvent: DbOrEvent,
	userId: string | number
): Promise<Suggestion[]> {
	const db = resolveDb(dbOrEvent);
	const res = await db
		.prepare(
			`SELECT le.id AS lessonId, le.title AS title, s.title AS subjectTitle
			 FROM lessons le
			 JOIN materials m ON m.id = le.material_id
			 JOIN levels l ON l.id = m.level_id
			 JOIN subjects s ON s.id = l.subject_id
			 WHERE NOT EXISTS (
				SELECT 1 FROM lesson_progress p
				WHERE p.user_id = ? AND p.lesson_id = le.id AND p.done = 1
			 )
			 ORDER BY s.sort, s.title, l.sort, l.title, m.sort, m.title, le.sort, le.title
			 LIMIT 3`
		)
		.bind(userId)
		.all<Suggestion>();
	return res.results ?? [];
}

interface PackageRow {
	quizId: string;
	title: string;
	sectionSlug: string;
	lessonId: string;
	lessonTitle: string;
	materialTitle: string;
	subjectTitle: string;
	levelTitle: string;
	subjectId: string;
	levelId: string;
}

export async function listScopedPackages(
	dbOrEvent: DbOrEvent,
	subjectId?: string,
	levelId?: string
): Promise<Package[]> {
	const db = resolveDb(dbOrEvent);
	const conds: string[] = [];
	const args: string[] = [];
	if (subjectId) {
		conds.push('s.id = ?');
		args.push(subjectId);
	}
	if (levelId) {
		conds.push('l.id = ?');
		args.push(levelId);
	}
	const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
	const quizzesRes = await db
		.prepare(
			`SELECT q.id AS quizId, q.title AS title, COALESCE(q.section_slug, '') AS sectionSlug,
				le.id AS lessonId, le.title AS lessonTitle, m.title AS materialTitle,
				s.title AS subjectTitle, l.title AS levelTitle, s.id AS subjectId, l.id AS levelId
			 FROM quizzes q
			 JOIN lessons le ON le.id = q.lesson_id
			 JOIN materials m ON m.id = le.material_id
			 JOIN levels l ON l.id = m.level_id
			 JOIN subjects s ON s.id = l.subject_id
			 ${where}
			 ORDER BY s.sort, s.title, l.sort, l.title, m.sort, m.title, le.sort, le.title, q.sort, q.title`
		)
		.bind(...args)
		.all<PackageRow>();
	const quizRows = quizzesRes.results ?? [];
	const questionsRes =
		quizRows.length === 0
			? { results: [] as QuestionRow[] }
			: await db
					.prepare(
						`SELECT id, quiz_id, question_text, COALESCE(type, 'choice') AS type,
							COALESCE(options_json, '[]') AS options_json,
							COALESCE(correct_answer, '') AS correct_answer
						 FROM quiz_questions WHERE quiz_id IN (${quizRows.map(() => '?').join(', ')})
						 ORDER BY sort, id`
					)
					.bind(...quizRows.map((q) => q.quizId))
					.all<QuestionRow>();
	const questionsByQuiz = new Map<string, QuizQuestion[]>();
	for (const row of questionsRes.results ?? []) {
		const list = questionsByQuiz.get(row.quiz_id) ?? [];
		list.push(parseQuestion(row));
		questionsByQuiz.set(row.quiz_id, list);
	}
	return quizRows.map((q) => {
		const questions = questionsByQuiz.get(q.quizId) ?? [];
		return {
			quizId: q.quizId,
			title: q.title,
			sectionSlug: q.sectionSlug ?? '',
			lessonId: q.lessonId,
			lessonTitle: q.lessonTitle,
			materialTitle: q.materialTitle,
			subjectTitle: q.subjectTitle,
			levelTitle: q.levelTitle,
			subjectId: q.subjectId,
			levelId: q.levelId,
			questionCount: questions.length,
			questions
		};
	});
}

interface LessonCardRow {
	id: string;
	lesson_id: string;
	pack_id: string | null;
	section_slug: string;
	front: string;
	back: string;
	sort: number;
}

interface CardPackRow {
	packId: string;
	packTitle: string;
	cardKind: string;
	packSort: number;
	lessonId: string;
	lessonTitle: string;
	materialTitle: string;
	subjectTitle: string;
	levelTitle: string;
	subjectId: string;
	levelId: string;
	bodyLen: number;
	lessonEmpty?: boolean;
}

function toCardQuestion(c: LessonCardRow): QuizQuestion | null {
	if (!c.front.trim() || !c.back.trim()) return null;
	return {
		id: c.id,
		question_text: c.front,
		type: 'text',
		options: [],
		pairs: [],
		correct_answer: c.back,
		sectionSlug: c.section_slug ?? ''
	};
}

function toCardKind(v: unknown): 'word' | 'study' {
	return v === 'study' ? 'study' : 'word';
}

function toCardPack(
	r: CardPackRow,
	questions: QuizQuestion[],
	attached?: { id: string; title: string }[]
): Package {
	const multi =
		attached && attached.length > 0
			? attached
			: [{ id: r.lessonId, title: r.lessonTitle }];
	const first = multi[0] ?? { id: r.lessonId, title: r.lessonTitle };
	return {
		quizId: `pack:${r.packId}`,
		title: r.packTitle,
		sectionSlug: '',
		lessonId: r.lessonId,
		lessonTitle: r.lessonTitle,
		materialTitle: r.materialTitle ?? '',
		subjectTitle: r.subjectTitle ?? '',
		levelTitle: r.levelTitle ?? '',
		subjectId: r.subjectId ?? '',
		levelId: r.levelId ?? '',
		questionCount: questions.length,
		questions,
		cardKind: toCardKind(r.cardKind),
		attachedLessonId: first.id,
		attachedLessonTitle: first.title,
		attachedLessonIds: multi.map((m) => m.id),
		attachedLessons: multi,
		lessonEmpty: r.lessonEmpty ?? false
	};
}

async function fetchCardPacks(
	db: D1Database,
	where: string,
	args: string[]
): Promise<{ packs: CardPackRow[]; cardsByPack: Map<string, QuizQuestion[]> }> {
	const packsRes = await db
		.prepare(
			`SELECT p.id AS packId, p.title AS packTitle, COALESCE(p.card_kind, 'word') AS cardKind,
				COALESCE(p.sort, 0) AS packSort,
				le.id AS lessonId, le.title AS lessonTitle,
				LENGTH(TRIM(COALESCE(le.body_md, ''))) AS bodyLen,
				m.title AS materialTitle, s.title AS subjectTitle, l.title AS levelTitle,
				s.id AS subjectId, l.id AS levelId
			 FROM lesson_card_packs p
			 JOIN lessons le ON le.id = p.lesson_id
			 JOIN materials m ON m.id = le.material_id
			 JOIN levels l ON l.id = m.level_id
			 JOIN subjects s ON s.id = l.subject_id
			 ${where}
			 ORDER BY s.sort, s.title, l.sort, l.title, m.sort, m.title, le.sort, le.title,
				p.sort, p.title`
		)
		.bind(...args)
		.all<CardPackRow>();
	const packRows = packsRes.results ?? [];
	const cardsByPack = new Map<string, QuizQuestion[]>();
	if (packRows.length > 0) {
		// Üres lecke jelzés: nincs szöveg és nincs kvíz. Az ilyen csomag
		// önálló szókártya, leckeoldalra mutató link nélkül.
		const quizRes = await db
			.prepare(
				`SELECT lesson_id AS id, COUNT(*) AS n FROM quizzes
				 WHERE lesson_id IN (${[...new Set(packRows.map((r) => r.lessonId))].map(() => '?').join(', ')})
				 GROUP BY lesson_id`
			)
			.bind(...[...new Set(packRows.map((r) => r.lessonId))])
			.all<{ id: string; n: number }>()
			.catch(() => ({ results: [] }) as { results: { id: string; n: number }[] });
		const quizCounts = new Map<string, number>();
		for (const row of quizRes.results ?? []) quizCounts.set(row.id, row.n ?? 0);
		for (const r of packRows) {
			r.lessonEmpty = (r.bodyLen ?? 0) === 0 && (quizCounts.get(r.lessonId) ?? 0) === 0;
		}
		const cardsRes = await db
			.prepare(
				`SELECT id, lesson_id, pack_id, COALESCE(section_slug, '') AS section_slug,
					COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(sort, 0) AS sort
				 FROM lesson_cards WHERE pack_id IN (${packRows.map(() => '?').join(', ')})
				 ORDER BY sort, id`
			)
			.bind(...packRows.map((r) => r.packId))
			.all<LessonCardRow>();
		for (const c of cardsRes.results ?? []) {
			const q = toCardQuestion(c);
			if (!q || !c.pack_id) continue;
			const list = cardsByPack.get(c.pack_id) ?? [];
			list.push(q);
			cardsByPack.set(c.pack_id, list);
		}
	}
	return { packs: packRows, cardsByPack };
}

/** Hivatalos kártyacsomagok: leckénként akár több csomag.
 *  A kvízektől független készlet: a kártya nem a kvízből generálódik futásidőben.
 *  Csomagazonosító: `pack:<packId>`. */
export async function listOfficialCardPacks(
	dbOrEvent: DbOrEvent,
	subjectId?: string,
	levelId?: string
): Promise<Package[]> {
	const db = resolveDb(dbOrEvent);
	const conds: string[] = [];
	const args: string[] = [];
	if (subjectId) {
		conds.push('s.id = ?');
		args.push(subjectId);
	}
	if (levelId) {
		conds.push('l.id = ?');
		args.push(levelId);
	}
	const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
	const { packs, cardsByPack } = await fetchCardPacks(db, where, args);
	const multi = await packMultiMap(
		db,
		packs.map((r) => r.packId)
	).catch(() => new Map<string, { id: string; title: string }[]>());
	const out: Package[] = [];
	for (const r of packs) {
		const questions = cardsByPack.get(r.packId) ?? [];
		if (questions.length === 0) continue;
		const m = multi.get(r.packId);
		const attached =
			m && m.length > 0 ? m : [{ id: r.lessonId, title: r.lessonTitle }];
		// Az elsődleges mindig elöl, duplikátum nélkül.
		if (!attached.some((a) => a.id === r.lessonId)) {
			attached.unshift({ id: r.lessonId, title: r.lessonTitle });
		}
		out.push(toCardPack(r, questions, attached));
	}
	return out;
}

/** Egy lecke összes hivatalos kártyacsomagja (a leckeoldal Kapcsolódó részéhez).
 *  A kapcsolótábla szerint több leckéhez csatolt csomag mindegyik leckénél megjelenik. */
export async function listOfficialCardPacksForLesson(
	dbOrEvent: DbOrEvent,
	lessonId: string
): Promise<Package[]> {
	const db = resolveDb(dbOrEvent);
	const { packs: legacyPacks, cardsByPack: legacyCards } = await fetchCardPacks(
		db,
		`WHERE p.lesson_id = ?`,
		[lessonId]
	);
	const byPack = new Map<string, CardPackRow>();
	for (const r of legacyPacks) byPack.set(r.packId, r);
	const mergedCards = new Map(legacyCards);
	// Kapcsoló szerinti extra csomagok (régi DB-n a tábla hiánya nem hiba).
	try {
		const extra = await db
			.prepare(`SELECT pack_id AS packId FROM lesson_card_pack_lessons WHERE lesson_id = ?`)
			.bind(lessonId)
			.all<{ packId: string }>();
		const extraIds = (extra.results ?? [])
			.map((r) => r.packId)
			.filter((id) => id && !byPack.has(id));
		for (const pid of extraIds.slice(0, 50)) {
			try {
				const { packs, cardsByPack } = await fetchCardPacks(db, `WHERE p.id = ?`, [pid]);
				const r = packs[0];
				if (!r) continue;
				byPack.set(r.packId, r);
				const qs = cardsByPack.get(r.packId) ?? [];
				if (qs.length > 0) mergedCards.set(r.packId, qs);
			} catch {
				// egy hibás csomag nem blokkol
			}
		}
	} catch {
		// kapcsoló még nincs
	}
	const packIds = [...byPack.keys()];
	const multi = await packMultiMap(db, packIds).catch(
		() => new Map<string, { id: string; title: string }[]>()
	);
	const out: Package[] = [];
	for (const r of byPack.values()) {
		const questions = mergedCards.get(r.packId) ?? [];
		if (questions.length === 0) continue;
		const m = multi.get(r.packId);
		const attached = m && m.length > 0 ? m : [{ id: r.lessonId, title: r.lessonTitle }];
		if (!attached.some((a) => a.id === r.lessonId)) {
			attached.unshift({ id: r.lessonId, title: r.lessonTitle });
		}
		out.push(toCardPack(r, questions, attached));
	}
	return out;
}

/** Egyetlen hivatalos kártyacsomag azonosítóval (vagy null). */
export async function getOfficialCardPackById(
	dbOrEvent: DbOrEvent,
	packId: string
): Promise<Package | null> {
	const db = resolveDb(dbOrEvent);
	const { packs, cardsByPack } = await fetchCardPacks(db, `WHERE p.id = ?`, [packId]);
	const r = packs[0];
	if (!r) return null;
	const questions = cardsByPack.get(r.packId) ?? [];
	if (questions.length === 0) return null;
	let attached: { id: string; title: string }[] | undefined;
	try {
		attached = await packAttachedLessons(db, r.packId);
	} catch {
		attached = undefined;
	}
	const list =
		attached && attached.length > 0 ? attached : [{ id: r.lessonId, title: r.lessonTitle }];
	if (!list.some((a) => a.id === r.lessonId)) {
		list.unshift({ id: r.lessonId, title: r.lessonTitle });
	}
	return toCardPack(r, questions, list);
}

/** Egyetlen hivatalos kártyacsomag leckéhez (vagy null, ha nincs kártyája).
 *  Kompatibilitási réteg a régi `cards:<lessonId>` azonosítókhoz: az első csomag. */
export async function getOfficialCardPack(
	dbOrEvent: DbOrEvent,
	lessonId: string
): Promise<Package | null> {
	const packs = await listOfficialCardPacksForLesson(dbOrEvent, lessonId);
	if (packs[0]) return packs[0];
	// Régi adat pack nélkül: a csomagoltalan kártyákból képzett készlet.
	const db = resolveDb(dbOrEvent);
	const cardsRes = await db
		.prepare(
			`SELECT lc.id AS id, lc.lesson_id AS lesson_id, lc.pack_id AS pack_id,
				COALESCE(lc.section_slug, '') AS section_slug,
				COALESCE(lc.front, '') AS front, COALESCE(lc.back, '') AS back,
				COALESCE(lc.sort, 0) AS sort,
				le.title AS lessonTitle, m.title AS materialTitle,
				s.title AS subjectTitle, l.title AS levelTitle,
				s.id AS subjectId, l.id AS levelId
			 FROM lesson_cards lc
			 JOIN lessons le ON le.id = lc.lesson_id
			 JOIN materials m ON m.id = le.material_id
			 JOIN levels l ON l.id = m.level_id
			 JOIN subjects s ON s.id = l.subject_id
			 WHERE lc.lesson_id = ? AND lc.pack_id IS NULL
			 ORDER BY lc.sort, lc.id`
		)
		.bind(lessonId)
		.all<LessonCardRow & { lessonTitle: string; materialTitle: string; subjectTitle: string; levelTitle: string; subjectId: string; levelId: string }>();
	const rows = cardsRes.results ?? [];
	if (rows.length === 0) return null;
	const questions: QuizQuestion[] = [];
	for (const c of rows) {
		const q = toCardQuestion(c);
		if (q) questions.push(q);
	}
	if (questions.length === 0) return null;
	const first = rows[0];
	return {
		quizId: `cards:${lessonId}`,
		title: `${first.lessonTitle} - kártyák`,
		sectionSlug: '',
		lessonId,
		lessonTitle: first.lessonTitle,
		materialTitle: first.materialTitle ?? '',
		subjectTitle: first.subjectTitle ?? '',
		levelTitle: first.levelTitle ?? '',
		subjectId: first.subjectId ?? '',
		levelId: first.levelId ?? '',
		questionCount: questions.length,
		questions,
		cardKind: 'word',
		attachedLessonId: lessonId,
		attachedLessonTitle: first.lessonTitle,
		attachedLessonIds: [lessonId],
		attachedLessons: [{ id: lessonId, title: first.lessonTitle }]
	};
}

/** A felhasználó saját kártyacsomagjai Package-alakban (csak a sajátjai). */
export async function listUserDecks(
	dbOrEvent: DbOrEvent,
	userId: string | number,
	subjectId?: string,
	levelId?: string
): Promise<Package[]> {
	const db = resolveDb(dbOrEvent);
	const conds = ['d.user_id = ?'];
	const args: (string | number)[] = [userId];
	if (subjectId) {
		conds.push('d.subject_id = ?');
		args.push(subjectId);
	}
	if (levelId) {
		conds.push('d.level_id = ?');
		args.push(levelId);
	}
	const decksRes = await db
		.prepare(
			`SELECT d.id AS id, d.title AS title,
				COALESCE(d.kind, 'cards') AS kind,
				COALESCE(d.card_kind, 'word') AS cardKind,
				COALESCE(s.title, 'Saját') AS subjectTitle,
				COALESCE(l.title, '') AS levelTitle,
				COALESCE(m.title, '') AS materialTitle,
				d.subject_id AS subjectId,
				d.level_id AS levelId,
				d.lesson_id AS attachedLessonId,
				COALESCE(le.title, '') AS attachedLessonTitle
			 FROM decks d
			 LEFT JOIN subjects s ON s.id = d.subject_id
			 LEFT JOIN levels l ON l.id = d.level_id
			 LEFT JOIN materials m ON m.id = d.material_id
			 LEFT JOIN lessons le ON le.id = d.lesson_id
			 WHERE ${conds.join(' AND ')}
			 ORDER BY d.created_at DESC`
		)
		.bind(...args)
		.all<{
			id: string;
			title: string;
			kind: string;
			cardKind: string;
			subjectTitle: string;
			levelTitle: string;
			materialTitle: string;
			subjectId: string | null;
			levelId: string | null;
			attachedLessonId: string | null;
			attachedLessonTitle: string;
		}>();
	const decks = decksRes.results ?? [];
	if (decks.length === 0) return [];
	const cardsRes = await db
		.prepare(
			`SELECT id, deck_id, COALESCE(front, '') AS front, COALESCE(back, '') AS back,
				COALESCE(section_slug, '') AS section_slug
			 FROM deck_cards WHERE deck_id IN (${decks.map(() => '?').join(', ')})
			 ORDER BY sort, id`
		)
		.bind(...decks.map((d) => d.id))
		.all<{ id: string; deck_id: string; front: string; back: string; section_slug: string }>();
	const cardsByDeck = new Map<string, QuizQuestion[]>();
	for (const c of cardsRes.results ?? []) {
		const list = cardsByDeck.get(c.deck_id) ?? [];
		list.push({
			id: c.id,
			question_text: c.front,
			type: 'text',
			options: [],
			pairs: [],
			correct_answer: c.back,
			sectionSlug: c.section_slug ?? ''
		});
		cardsByDeck.set(c.deck_id, list);
	}
	const multi = await deckMultiMap(
		db,
		decks.map((d) => d.id)
	).catch(() => new Map<string, { id: string; title: string }[]>());
	return decks.map((d) => {
		const questions = cardsByDeck.get(d.id) ?? [];
		const m = multi.get(d.id) ?? [];
		// Régi egy-leckés mező is része a többes listának.
		if (d.attachedLessonId && !m.some((x) => x.id === d.attachedLessonId)) {
			m.unshift({ id: d.attachedLessonId, title: d.attachedLessonTitle ?? '' });
		}
		const first = m[0];
		return {
			quizId: `deck:${d.id}`,
			title: d.title,
			sectionSlug: '',
			lessonId: '',
			lessonTitle: d.title,
			materialTitle: d.materialTitle ?? '',
			subjectTitle: d.subjectTitle ?? 'Saját',
			levelTitle: d.levelTitle ?? '',
			subjectId: d.subjectId ?? '',
			levelId: d.levelId ?? '',
			questionCount: questions.length,
			questions,
			mine: true,
			kind: d.kind === 'quiz' ? 'quiz' : 'cards',
			cardKind: toCardKind(d.cardKind),
			attachedLessonId: first?.id ?? (d.attachedLessonId ?? ''),
			attachedLessonTitle: first?.title ?? (d.attachedLessonTitle ?? ''),
			attachedLessonIds: m.map((x) => x.id),
			attachedLessons: m
		};
	});
}

/** Egy leckéhez csatolt saját csomagok (a leckeoldal „Kapcsolódó csomagok” részéhez).
 *  D1-optimalizálás: SQL-ben szűrve a leckére (eddig az ÖSSZES saját csomag
 *  + kártya lejött, és JS-ben szűrtünk).
 *  Több leckéhez csatolt csomag mindegyik leckénél megjelenik (kapcsolótábla unió). */
export async function listDecksForLesson(
	dbOrEvent: DbOrEvent,
	userId: string | number,
	lessonId: string
): Promise<Package[]> {
	const db = resolveDb(dbOrEvent);
	// Kapcsoló szerinti deck-azonosítók (régi DB-n üres).
	let extraIds: string[] = [];
	try {
		const extra = await db
			.prepare(`SELECT deck_id AS id FROM deck_lessons WHERE lesson_id = ?`)
			.bind(lessonId)
			.all<{ id: string }>();
		extraIds = (extra.results ?? []).map((r) => r.id).filter(Boolean);
	} catch {
		extraIds = [];
	}
	const decksRes = await db
		.prepare(
			`SELECT d.id AS id, d.title AS title,
				COALESCE(d.kind, 'cards') AS kind,
				COALESCE(d.card_kind, 'word') AS cardKind,
				COALESCE(s.title, 'Saját') AS subjectTitle,
				COALESCE(l.title, '') AS levelTitle,
				COALESCE(m.title, '') AS materialTitle,
				d.subject_id AS subjectId,
				d.level_id AS levelId,
				d.lesson_id AS attachedLessonId,
				COALESCE(le.title, '') AS attachedLessonTitle
			 FROM decks d
			 LEFT JOIN subjects s ON s.id = d.subject_id
			 LEFT JOIN levels l ON l.id = d.level_id
			 LEFT JOIN materials m ON m.id = d.material_id
			 LEFT JOIN lessons le ON le.id = d.lesson_id
			 WHERE d.user_id = ? AND (${
				 extraIds.length > 0
					 ? `d.lesson_id = ? OR d.id IN (${extraIds.map(() => '?').join(', ')})`
					 : `d.lesson_id = ?`
			 })
			 ORDER BY d.created_at DESC`
		)
		.bind(userId, lessonId, ...extraIds)
		.all<{
			id: string;
			title: string;
			kind: string;
			cardKind: string;
			subjectTitle: string;
			levelTitle: string;
			materialTitle: string;
			subjectId: string | null;
			levelId: string | null;
			attachedLessonId: string | null;
			attachedLessonTitle: string;
		}>();
	const decks = decksRes.results ?? [];
	if (decks.length === 0) return [];
	const cardsRes = await db
		.prepare(
			`SELECT id, deck_id, COALESCE(front, '') AS front, COALESCE(back, '') AS back,
				COALESCE(section_slug, '') AS section_slug
			 FROM deck_cards WHERE deck_id IN (${decks.map(() => '?').join(', ')})
			 ORDER BY sort, id`
		)
		.bind(...decks.map((d) => d.id))
		.all<{ id: string; deck_id: string; front: string; back: string; section_slug: string }>();
	const cardsByDeck = new Map<string, QuizQuestion[]>();
	for (const c of cardsRes.results ?? []) {
		const list = cardsByDeck.get(c.deck_id) ?? [];
		list.push({
			id: c.id,
			question_text: c.front,
			type: 'text',
			options: [],
			pairs: [],
			correct_answer: c.back,
			sectionSlug: c.section_slug ?? ''
		});
		cardsByDeck.set(c.deck_id, list);
	}
	const multi = await deckMultiMap(
		db,
		decks.map((d) => d.id)
	).catch(() => new Map<string, { id: string; title: string }[]>());
	return decks.map((d) => {
		const questions = cardsByDeck.get(d.id) ?? [];
		const m = multi.get(d.id) ?? [];
		if (d.attachedLessonId && !m.some((x) => x.id === d.attachedLessonId)) {
			m.unshift({ id: d.attachedLessonId, title: d.attachedLessonTitle ?? '' });
		}
		const first = m[0];
		return {
			quizId: `deck:${d.id}`,
			title: d.title,
			sectionSlug: '',
			lessonId: '',
			lessonTitle: d.title,
			materialTitle: d.materialTitle ?? '',
			subjectTitle: d.subjectTitle ?? 'Saját',
			levelTitle: d.levelTitle ?? '',
			subjectId: d.subjectId ?? '',
			levelId: d.levelId ?? '',
			questionCount: questions.length,
			questions,
			mine: true,
			kind: d.kind === 'quiz' ? 'quiz' : 'cards',
			cardKind: toCardKind(d.cardKind),
			attachedLessonId: first?.id ?? (d.attachedLessonId ?? ''),
			attachedLessonTitle: first?.title ?? (d.attachedLessonTitle ?? ''),
			attachedLessonIds: m.map((x) => x.id),
			attachedLessons: m
		};
	});
}

/** Egyetlen saját csomag azonosítóval (vagy null).
 *  D1-optimalizálás: csak az 1 csomag + kártyái jön le
 *  (eddig az összes saját csomag lejött 1 találathoz). */
export async function getUserDeckPackage(
	dbOrEvent: DbOrEvent,
	userId: string | number,
	deckId: string
): Promise<Package | null> {
	const db = resolveDb(dbOrEvent);
	const deck = await db
		.prepare(
			`SELECT d.id AS id, d.title AS title,
				COALESCE(d.kind, 'cards') AS kind,
				COALESCE(d.card_kind, 'word') AS cardKind,
				COALESCE(s.title, 'Saját') AS subjectTitle,
				COALESCE(l.title, '') AS levelTitle,
				COALESCE(m.title, '') AS materialTitle,
				d.subject_id AS subjectId,
				d.level_id AS levelId,
				d.lesson_id AS attachedLessonId,
				COALESCE(le.title, '') AS attachedLessonTitle
			 FROM decks d
			 LEFT JOIN subjects s ON s.id = d.subject_id
			 LEFT JOIN levels l ON l.id = d.level_id
			 LEFT JOIN materials m ON m.id = d.material_id
			 LEFT JOIN lessons le ON le.id = d.lesson_id
			 WHERE d.id = ? AND d.user_id = ?`
		)
		.bind(deckId, userId)
		.first<{
			id: string;
			title: string;
			kind: string;
			cardKind: string;
			subjectTitle: string;
			levelTitle: string;
			materialTitle: string;
			subjectId: string | null;
			levelId: string | null;
			attachedLessonId: string | null;
			attachedLessonTitle: string;
		}>();
	if (!deck) return null;
	const cardsRes = await db
		.prepare(
			`SELECT id, COALESCE(front, '') AS front, COALESCE(back, '') AS back,
				COALESCE(section_slug, '') AS section_slug
			 FROM deck_cards WHERE deck_id = ? ORDER BY sort, id`
		)
		.bind(deckId)
		.all<{ id: string; front: string; back: string; section_slug: string }>();
	const questions: QuizQuestion[] = (cardsRes.results ?? []).map((c) => ({
		id: c.id,
		question_text: c.front,
		type: 'text',
		options: [],
		pairs: [],
		correct_answer: c.back,
		sectionSlug: c.section_slug ?? ''
	}));
	let multi: { id: string; title: string }[] = [];
	try {
		multi = await deckAttachedLessons(db, deckId);
	} catch {
		multi = [];
	}
	if (deck.attachedLessonId && !multi.some((x) => x.id === deck.attachedLessonId)) {
		multi.unshift({ id: deck.attachedLessonId, title: deck.attachedLessonTitle ?? '' });
	}
	const first = multi[0];
	return {
		quizId: `deck:${deck.id}`,
		title: deck.title,
		sectionSlug: '',
		lessonId: '',
		lessonTitle: deck.title,
		materialTitle: deck.materialTitle ?? '',
		subjectTitle: deck.subjectTitle ?? 'Saját',
		levelTitle: deck.levelTitle ?? '',
		subjectId: deck.subjectId ?? '',
		levelId: deck.levelId ?? '',
		questionCount: questions.length,
		questions,
		mine: true,
		kind: deck.kind === 'quiz' ? 'quiz' : 'cards',
		cardKind: toCardKind(deck.cardKind),
		attachedLessonId: first?.id ?? (deck.attachedLessonId ?? ''),
		attachedLessonTitle: first?.title ?? (deck.attachedLessonTitle ?? ''),
		attachedLessonIds: multi.map((x) => x.id),
		attachedLessons: multi
	};
}

/** Egyetlen tananyagi kvíz azonosítóval (vagy null).
 *  D1-optimalizálás: csak az 1 kvíz + kérdései jön le
 *  (eddig a TELJES tananyag lejött 1 találathoz). */
export async function getScopedQuizPackage(
	dbOrEvent: DbOrEvent,
	quizId: string
): Promise<Package | null> {
	const db = resolveDb(dbOrEvent);
	const quiz = await db
		.prepare(
			`SELECT q.id AS quizId, q.title AS title, COALESCE(q.section_slug, '') AS sectionSlug,
				le.id AS lessonId, le.title AS lessonTitle, m.title AS materialTitle,
				s.title AS subjectTitle, l.title AS levelTitle, s.id AS subjectId, l.id AS levelId
			 FROM quizzes q
			 JOIN lessons le ON le.id = q.lesson_id
			 JOIN materials m ON m.id = le.material_id
			 JOIN levels l ON l.id = m.level_id
			 JOIN subjects s ON s.id = l.subject_id
			 WHERE q.id = ?`
		)
		.bind(quizId)
		.first<PackageRow>();
	if (!quiz) return null;
	const questionsRes = await db
		.prepare(
			`SELECT id, quiz_id, question_text, COALESCE(type, 'choice') AS type,
				COALESCE(options_json, '[]') AS options_json,
				COALESCE(correct_answer, '') AS correct_answer
			 FROM quiz_questions WHERE quiz_id = ? ORDER BY sort, id`
		)
		.bind(quizId)
		.all<QuestionRow>();
	const questions = (questionsRes.results ?? []).map(parseQuestion);
	return {
		quizId: quiz.quizId,
		title: quiz.title,
		sectionSlug: quiz.sectionSlug ?? '',
		lessonId: quiz.lessonId,
		lessonTitle: quiz.lessonTitle,
		materialTitle: quiz.materialTitle,
		subjectTitle: quiz.subjectTitle,
		levelTitle: quiz.levelTitle,
		subjectId: quiz.subjectId,
		levelId: quiz.levelId,
		questionCount: questions.length,
		questions
	};
}

/** Hivatalos kártyacsomagok azonosítólistával (vagy üres lista).
 *  D1-optimalizálás: csak a kért csomagok + kártyáik jönnek le
 *  (eddig az ÖSSZES hivatalos csomag lejött pár mentetthez). */
export async function listOfficialCardPacksByIds(
	dbOrEvent: DbOrEvent,
	packIds: string[]
): Promise<Package[]> {
	const db = resolveDb(dbOrEvent);
	const ids = [...new Set(packIds.filter(Boolean))];
	if (ids.length === 0) return [];
	const { packs, cardsByPack } = await fetchCardPacks(
		db,
		`WHERE p.id IN (${ids.map(() => '?').join(', ')})`,
		ids
	);
	const multi = await packMultiMap(
		db,
		packs.map((r) => r.packId)
	).catch(() => new Map<string, { id: string; title: string }[]>());
	const out: Package[] = [];
	for (const r of packs) {
		const questions = cardsByPack.get(r.packId) ?? [];
		if (questions.length === 0) continue;
		const m = multi.get(r.packId);
		const attached = m && m.length > 0 ? m : [{ id: r.lessonId, title: r.lessonTitle }];
		if (!attached.some((a) => a.id === r.lessonId)) {
			attached.unshift({ id: r.lessonId, title: r.lessonTitle });
		}
		out.push(toCardPack(r, questions, attached));
	}
	return out;
}

/** Kártyánkénti tudásszint SM-2 ütemezéssel: kulcs (kérdés-azonosító) → állapot.
 *  A repetitions, ease, intervalDays és dueDay hajtja a szavak gyakorlását,
 *  a known és seen a régi pöttyök és csíkok miatt marad. */
export interface CardMark {
	known: number;
	seen: number;
	repetitions: number;
	ease: number;
	intervalDays: number;
	dueDay: number;
}

export async function getCardProgress(
	dbOrEvent: DbOrEvent,
	userId: string | number
): Promise<Record<string, CardMark>> {
	const db = resolveDb(dbOrEvent);
	// D1-optimalizálás: felső korlát, hogy egy elfajult haladás-tábla se olvasson korlátlan sort.
	try {
		const res = await db
			.prepare(
				`SELECT card_key AS cardKey, known, seen,
					COALESCE(repetitions, 0) AS repetitions,
					COALESCE(ease, 2.5) AS ease,
					COALESCE(interval_days, 0) AS intervalDays,
					COALESCE(due_day, 0) AS dueDay
				 FROM card_progress WHERE user_id = ? LIMIT 5000`
			)
			.bind(userId)
			.all<{
				cardKey: string;
				known: number;
				seen: number;
				repetitions: number;
				ease: number;
				intervalDays: number;
				dueDay: number;
			}>();
		const map: Record<string, CardMark> = {};
		for (const row of res.results ?? []) {
			map[row.cardKey] = {
				known: row.known ?? 0,
				seen: row.seen ?? 0,
				repetitions: row.repetitions ?? 0,
				ease: row.ease ?? 2.5,
				intervalDays: row.intervalDays ?? 0,
				dueDay: row.dueDay ?? 0
			};
		}
		return map;
	} catch {
		// Régi séma (migráció előtt): SM-2 mezők nélkül, alapértelmezett ütemezéssel.
		try {
			const res = await db
				.prepare(`SELECT card_key AS cardKey, known, seen FROM card_progress WHERE user_id = ? LIMIT 5000`)
				.bind(userId)
				.all<{ cardKey: string; known: number; seen: number }>();
			const map: Record<string, CardMark> = {};
			for (const row of res.results ?? []) {
				map[row.cardKey] = {
					known: row.known ?? 0,
					seen: row.seen ?? 0,
					repetitions: 0,
					ease: 2.5,
					intervalDays: 0,
					dueDay: 0
				};
			}
			return map;
		} catch {
			return {};
		}
	}
}

/** SM-2 osztályzatok mentése helyben frissítve: nincs új sor ismétléskor.
 *  Tudom = quality 4, Nem tudom = quality 1, intervallum napokban, due nap sorszámmal. */
export async function saveCardProgress(
	dbOrEvent: DbOrEvent,
	userId: string | number,
	results: { key: string; known: boolean }[]
): Promise<void> {
	const db = resolveDb(dbOrEvent);
	// Nincs ensure: a sémát a migrációk biztosítják.
	const rows = results.filter((r) => r && typeof r.key === 'string' && r.key);
	if (rows.length === 0) return;
	const trimmed = rows.slice(0, 500);
	const today = todayDay();
	const now = new Date().toISOString();
	// Meglévő állapot egy körben, hogy az SM-2 számítás pontos legyen.
	const keys = [...new Set(trimmed.map((r) => r.key))];
	const current = new Map<string, CardMark>();
	for (let offset = 0; offset < keys.length; offset += 80) {
		const chunk = keys.slice(offset, offset + 80);
		const res = await db
			.prepare(
				`SELECT card_key AS cardKey, known, seen,
					COALESCE(repetitions, 0) AS repetitions,
					COALESCE(ease, 2.5) AS ease,
					COALESCE(interval_days, 0) AS intervalDays,
					COALESCE(due_day, 0) AS dueDay
				 FROM card_progress WHERE user_id = ? AND card_key IN (${chunk.map(() => '?').join(', ')}) LIMIT 500`
			)
			.bind(userId, ...chunk)
			.all<{
				cardKey: string;
				known: number;
				seen: number;
				repetitions: number;
				ease: number;
				intervalDays: number;
				dueDay: number;
			}>();
		for (const row of res.results ?? []) {
			current.set(row.cardKey, {
				known: row.known ?? 0,
				seen: row.seen ?? 0,
				repetitions: row.repetitions ?? 0,
				ease: row.ease ?? 2.5,
				intervalDays: row.intervalDays ?? 0,
				dueDay: row.dueDay ?? 0
			});
		}
	}
	await db.batch(
		trimmed.map((r) => {
			const next = gradeSM2(current.get(r.key), r.known, today);
			// A láncban többször szereplő kártya is helyesen halmoz: frissítjük a gyorstárat.
			current.set(r.key, next);
			return db
				.prepare(
					`INSERT INTO card_progress (user_id, card_key, known, seen, updated_at, repetitions, ease, interval_days, due_day)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
					 ON CONFLICT (user_id, card_key) DO UPDATE SET
						known = excluded.known,
						seen = excluded.seen,
						updated_at = excluded.updated_at,
						repetitions = excluded.repetitions,
						ease = excluded.ease,
						interval_days = excluded.interval_days,
						due_day = excluded.due_day`
				)
				.bind(userId, r.key, next.known, next.seen, now, next.repetitions, next.ease, next.intervalDays, next.dueDay);
		})
	);
}

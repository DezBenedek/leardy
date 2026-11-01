import { publishedLevelSql } from './curriculum-publication';
import type { MaterialNode, Subject, SubjectTree } from '$lib/curriculum/curriculum';
import {
	resolveDb,
	type DbOrEvent,
	type LessonRefRow,
	type LevelRow,
	type MaterialRow,
	type SubjectRow
} from './shared';

export async function listSubjects(dbOrEvent: DbOrEvent): Promise<Subject[]> {
	const db = resolveDb(dbOrEvent);
	// Nincs ensure: az olvasást nem blokkoljuk ~25 DDL-lel (migrációk + író API-k biztosítják).
	// D1-optimalizálás: a korábbi korrelált COUNT-allekérdezések minden tantárgyra
	// újraolvasták a levels/materials/lessons táblákat (N * teljes scan).
	// Helyette 1 batchelt körben: tantárgyak + 3 GROUP BY számlálás.
	const [subjectsRes, levelCountRes, lessonCountRes, packCountRes] = await db.batch([
		db.prepare(
			`SELECT id, title, COALESCE(icon, 'book') AS icon, COALESCE(sort, 0) AS sort,
				COALESCE(level_label, 'Tananyag') AS levelLabel
				FROM subjects
				ORDER BY sort, title`
		),
		db.prepare(`SELECT subject_id AS id, COUNT(*) AS n FROM levels l WHERE ${publishedLevelSql('l')} GROUP BY subject_id`),
		// Leckeszám: csak a tartalmas leckék (szöveg vagy kvíz). Az üres
		// szókártya-hordozók nem számítanak bele, hogy a szám őszinte maradjon.
		db.prepare(
			`SELECT l.subject_id AS id, COUNT(DISTINCT le.id) AS n FROM lessons le
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
				 LEFT JOIN quizzes q ON q.lesson_id = le.id
				 WHERE TRIM(COALESCE(le.body_md, '')) != '' OR q.id IS NOT NULL
				 GROUP BY l.subject_id`
		),
		// Csomagszám: kártyát tartalmazó hivatalos csomagok tantárgyanként.
		db.prepare(
			`SELECT s.id AS id, COUNT(DISTINCT p.id) AS n FROM lesson_card_packs p
				 JOIN lessons le ON le.id = p.lesson_id
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
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
		levelLabel: 'Tananyag'
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
	const base = `SELECT q.lesson_id AS id, COUNT(*) AS n FROM quizzes q
		JOIN lessons le ON le.id = q.lesson_id
		JOIN materials m ON m.id = le.material_id
		JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}`;
	const scoped = `${base} WHERE l.subject_id = ? GROUP BY q.lesson_id`;
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
			 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
			 GROUP BY l.subject_id`
		)
		.all<{ id: string; n: number }>();
	const out: Record<string, number> = {};
	for (const r of res.results ?? []) out[r.id] = r.n ?? 0;
	return out;
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
				COALESCE(level_label, 'Tananyag') AS levelLabel FROM subjects WHERE id = ?`
			)
			.bind(subjectId),
		db
			.prepare(
				`SELECT id, title, COALESCE(sort, 0) AS sort FROM levels l WHERE subject_id = ? AND ${publishedLevelSql('l')} ORDER BY sort, title`
			)
			.bind(subjectId),
		db
			.prepare(
				`SELECT m.id, m.level_id, m.title, COALESCE(m.sort, 0) AS sort
				 FROM materials m JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
				 WHERE l.subject_id = ? ORDER BY m.sort, m.title`
			)
			.bind(subjectId),
		db
			.prepare(
				`SELECT le.id, le.material_id, le.title, COALESCE(le.sort, 0) AS sort,
					LENGTH(TRIM(COALESCE(le.body_md, ''))) AS bodyLen
				 FROM lessons le
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
				 WHERE l.subject_id = ? ORDER BY le.sort, le.title`
			)
			.bind(subjectId),
		db
			.prepare(
				`SELECT q.lesson_id AS id, COUNT(*) AS n FROM quizzes q
				 JOIN lessons le ON le.id = q.lesson_id
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
				 WHERE l.subject_id = ? GROUP BY q.lesson_id`
			)
			.bind(subjectId),
		db
			.prepare(
				`SELECT COUNT(DISTINCT p.id) AS n FROM lesson_card_packs p
				 JOIN lessons le ON le.id = p.lesson_id
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
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
					 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
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
		levelLabel: 'Tananyag',
		levelCount: levelNodes.length,
		lessonCount,
		packCount:
			(packCountRes as unknown as { results: { n: number }[] }).results?.[0]?.n ?? 0,
		levels: levelNodes
	};
}

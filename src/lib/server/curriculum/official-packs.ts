import { publishedLevelSql } from './curriculum-publication';
import type { Package, QuizQuestion } from '$lib/curriculum/curriculum';
import {
	fetchCardPacks,
	packAttachedLessons,
	packMultiMap,
	resolveDb,
	toCardPack,
	toCardQuestion,
	type CardPackRow,
	type DbOrEvent,
	type LessonCardRow
} from './shared';

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
		// Egy kötegelt IN-lekérés az egyenkénti ciklus helyett (50-es plafonnal).
		const wanted = extraIds.slice(0, 50);
		if (wanted.length > 0) {
			try {
				const { packs, cardsByPack } = await fetchCardPacks(
					db,
					`WHERE p.id IN (${wanted.map(() => '?').join(', ')})`,
					wanted
				);
				for (const r of packs) {
					byPack.set(r.packId, r);
					const qs = cardsByPack.get(r.packId) ?? [];
					if (qs.length > 0) mergedCards.set(r.packId, qs);
				}
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
			 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
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
	// D1 paraméterkorlát miatt darabolva, eredmény összefűzve.
	const out: Package[] = [];
	for (let i = 0; i < ids.length; i += 50) {
		const chunk = ids.slice(i, i + 50);
		const { packs, cardsByPack } = await fetchCardPacks(
			db,
			`WHERE p.id IN (${chunk.map(() => '?').join(', ')})`,
			chunk
		);
		const multi = await packMultiMap(
			db,
			packs.map((r) => r.packId)
		).catch(() => new Map<string, { id: string; title: string }[]>());
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
	}
	return out;
}

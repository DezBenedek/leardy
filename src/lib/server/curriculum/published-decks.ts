import type { D1Database } from '@cloudflare/workers-types';
import type { Package, QuizQuestion } from '$lib/curriculum/curriculum';
import {
	deckMultiMap,
	resolveDb,
	toCardKind,
	type DbOrEvent,
	type PublishedDeckRow
} from './shared';

/** Tanári jogosultság szókártya-publikáláshoz és leckéhez csatoláshoz.
 *  Csak tanár, admin szerep vagy admin jelölés számít, a diák nem. */
export function canPublishDeck(
	user: { role?: string | null; is_admin?: number | null } | null | undefined
): boolean {
	if (!user) return false;
	return user.role === 'teacher' || user.role === 'admin' || !!user.is_admin;
}

/** Publikált csomagsorok Package-alakba: kártyák + többes csatolás.
 *  Régi DB-n (is_public oszlop nélkül) üres listát ad, nem hibát. */
async function mapPublishedDecks(
	db: D1Database,
	rows: PublishedDeckRow[],
	viewerId?: string | number | null
): Promise<Package[]> {
	if (rows.length === 0) return [];
	const cardsRes = await db
		.prepare(
			`SELECT id, deck_id, COALESCE(front, '') AS front, COALESCE(back, '') AS back,
				COALESCE(section_slug, '') AS section_slug
			 FROM deck_cards WHERE deck_id IN (${rows.map(() => '?').join(', ')})
			 ORDER BY sort, id`
		)
		.bind(...rows.map((d) => d.id))
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
		rows.map((d) => d.id)
	).catch(() => new Map<string, { id: string; title: string }[]>());
	const out: Package[] = [];
	for (const d of rows) {
		const questions = cardsByDeck.get(d.id) ?? [];
		// Üres publikált csomag nem listázódik.
		if (questions.length === 0) continue;
		const m = multi.get(d.id) ?? [];
		if (d.attachedLessonId && !m.some((x) => x.id === d.attachedLessonId)) {
			m.unshift({ id: d.attachedLessonId, title: d.attachedLessonTitle ?? '' });
		}
		const first = m[0];
		out.push({
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
			mine: false,
			kind: d.kind === 'quiz' ? 'quiz' : 'cards',
			cardKind: toCardKind(d.cardKind),
			attachedLessonId: first?.id ?? (d.attachedLessonId ?? ''),
			attachedLessonTitle: first?.title ?? (d.attachedLessonTitle ?? ''),
			attachedLessonIds: m.map((x) => x.id),
			attachedLessons: m,
			isPublic: true,
			ownerName: d.ownerName ?? ''
		});
	}
	// A saját publikált csomagját a tulajdonos sajátként látja.
	if (viewerId != null && String(viewerId) !== '') {
		try {
			const ownRes = await db
				.prepare(`SELECT id FROM decks WHERE user_id = ? AND COALESCE(is_public, 0) = 1`)
				.bind(viewerId)
				.all<{ id: string }>()
				.catch(() => ({ results: [] }) as { results: { id: string }[] });
			const own = new Set((ownRes.results ?? []).map((r) => r.id));
			for (const p of out) {
				if (own.has(p.quizId.slice('deck:'.length))) p.mine = true;
			}
		} catch {
			// jelölés nélkül is jó a lista
		}
	}
	return out;
}

const PUBLISHED_DECK_FROM = `FROM decks d
	 LEFT JOIN subjects s ON s.id = d.subject_id
	 LEFT JOIN levels l ON l.id = d.level_id
	 LEFT JOIN materials m ON m.id = d.material_id
	 LEFT JOIN lessons le ON le.id = d.lesson_id
	 LEFT JOIN users u ON u.id = d.user_id`;

/** Minden publikált csomag (Felfedezés): tanári, nem üres csomagok. */
export async function listPublishedDecks(
	dbOrEvent: DbOrEvent,
	subjectId?: string,
	levelId?: string,
	viewerId?: string | number | null
): Promise<Package[]> {
	const db = resolveDb(dbOrEvent);
	try {
		const conds = [`COALESCE(d.is_public, 0) = 1`];
		const args: (string | number)[] = [];
		if (subjectId) {
			conds.push('d.subject_id = ?');
			args.push(subjectId);
		}
		if (levelId) {
			conds.push('d.level_id = ?');
			args.push(levelId);
		}
		const res = await db
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
					COALESCE(le.title, '') AS attachedLessonTitle,
					COALESCE(u.name, '') AS ownerName
				 ${PUBLISHED_DECK_FROM}
				 WHERE ${conds.join(' AND ')}
				 ORDER BY d.created_at DESC LIMIT 500`
			)
			.bind(...args)
			.all<PublishedDeckRow>();
		return mapPublishedDecks(db, res.results ?? [], viewerId);
	} catch {
		// régi DB is_public nélkül: nincs publikált csomag
		return [];
	}
}

/** Egy leckéhez csatolt publikált csomagok (leckeoldal Kártyacsomagok része). */
export async function listPublishedDecksForLesson(
	dbOrEvent: DbOrEvent,
	lessonId: string,
	viewerId?: string | number | null
): Promise<Package[]> {
	const db = resolveDb(dbOrEvent);
	try {
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
		const res = await db
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
					COALESCE(le.title, '') AS attachedLessonTitle,
					COALESCE(u.name, '') AS ownerName
				 ${PUBLISHED_DECK_FROM}
				 WHERE COALESCE(d.is_public, 0) = 1 AND (${
					 extraIds.length > 0
						 ? `d.lesson_id = ? OR d.id IN (${extraIds.map(() => '?').join(', ')})`
						 : `d.lesson_id = ?`
				 })
				 ORDER BY d.created_at DESC LIMIT 100`
			)
			.bind(lessonId, ...extraIds)
			.all<PublishedDeckRow>();
		return mapPublishedDecks(db, res.results ?? [], viewerId);
	} catch {
		return [];
	}
}

/** Egyetlen publikált csomag olvasása nem tulajdonosként (vagy null). */
export async function getPublishedDeckPackage(
	dbOrEvent: DbOrEvent,
	deckId: string,
	viewerId?: string | number | null
): Promise<Package | null> {
	const db = resolveDb(dbOrEvent);
	try {
		const row = await db
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
					COALESCE(le.title, '') AS attachedLessonTitle,
					COALESCE(u.name, '') AS ownerName
				 ${PUBLISHED_DECK_FROM}
				 WHERE d.id = ? AND COALESCE(d.is_public, 0) = 1`
			)
			.bind(deckId)
			.first<PublishedDeckRow>();
		if (!row) return null;
		const list = await mapPublishedDecks(db, [row], viewerId);
		return list[0] ?? null;
	} catch {
		return null;
	}
}

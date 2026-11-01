import type { Package, QuizQuestion } from '$lib/curriculum/curriculum';
import {
	deckAttachedLessons,
	deckMultiMap,
	resolveDb,
	toCardKind,
	type DbOrEvent
} from './shared';

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
				COALESCE(le.title, '') AS attachedLessonTitle,
				COALESCE(d.is_public, 0) AS isPublic
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
			isPublic: number;
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
			isPublic: !!d.isPublic,
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
				COALESCE(le.title, '') AS attachedLessonTitle,
				COALESCE(d.is_public, 0) AS isPublic
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
			isPublic: number;
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
			isPublic: !!d.isPublic,
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
				COALESCE(le.title, '') AS attachedLessonTitle,
				COALESCE(d.is_public, 0) AS isPublic
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
			isPublic: number;
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
		isPublic: !!deck.isPublic,
		kind: deck.kind === 'quiz' ? 'quiz' : 'cards',
		cardKind: toCardKind(deck.cardKind),
		attachedLessonId: first?.id ?? (deck.attachedLessonId ?? ''),
		attachedLessonTitle: first?.title ?? (deck.attachedLessonTitle ?? ''),
		attachedLessonIds: multi.map((x) => x.id),
		attachedLessons: multi
	};
}

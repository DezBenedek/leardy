import { loadQuestionOptions } from '../../question-types/registry';
import type { D1Database } from '@cloudflare/workers-types';
import type { RequestEvent } from '@sveltejs/kit';
import { getDb } from '../infra/db';
import { publishedLevelSql } from './curriculum-publication';
import type { Package, QuizQuestion } from '$lib/curriculum/curriculum';

/* Szerveroldali tanterv-lekérdezések D1-re (Svelte 5 runes nem kell szerveroldalra).
   Típusszerződés: $lib/curriculum. Függőség: csak D1. */

/** A lekérdezők D1Database-et vagy RequestEvent-et fogadnak első paramként;
 *  event esetén getDb-vel (./db) oldják fel az adatbázist. */
export type DbOrEvent = D1Database | RequestEvent;

export function resolveDb(dbOrEvent: DbOrEvent): D1Database {
	if (typeof (dbOrEvent as D1Database).prepare === 'function') return dbOrEvent as D1Database;
	const db = getDb(dbOrEvent as RequestEvent);
	if (!db) throw new Error('Az adatbázis most nem elérhető.');
	return db;
}

export interface SubjectRow {
	id: string;
	title: string;
	icon: string;
	sort: number;
	levelLabel: string;
}

export interface LevelRow {
	id: string;
	title: string;
	sort: number;
}
export interface MaterialRow {
	id: string;
	level_id: string;
	title: string;
	sort: number;
}
export interface LessonRefRow {
	id: string;
	material_id: string;
	title: string;
	sort: number;
	bodyLen: number;
}

export interface QuizRow {
	id: string;
	title: string;
	section_slug: string;
	sort: number;
}
export interface QuestionRow {
	id: string;
	quiz_id: string;
	question_text: string;
	type: string;
	options_json: string;
	correct_answer: string;
	section_slug?: string;
}

export interface PackageRow {
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

export interface LessonCardRow {
	id: string;
	lesson_id: string;
	pack_id: string | null;
	section_slug: string;
	front: string;
	back: string;
	sort: number;
}

export interface CardPackRow {
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

export interface PublishedDeckRow {
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
	ownerName: string;
}

/** Csatolt leckék egy saját csomaghoz: kapcsoló + régi oszlop uniója. */
export async function deckAttachedLessons(
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
export async function packAttachedLessons(
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

/** Kötegelt csatolás-térkép hivatalos csomagokhoz (packId -> leckék). */
export async function packMultiMap(
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
export async function deckMultiMap(
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

export function parseQuestion(row: QuestionRow): QuizQuestion {
	return {
		id: row.id,
		question_text: row.question_text,
		type: row.type ?? 'choice',
		...loadQuestionOptions(row.type ?? 'choice', row.options_json),
		correct_answer: row.correct_answer ?? '',
		sectionSlug: row.section_slug ?? ''
	};
}

export function toCardQuestion(c: LessonCardRow): QuizQuestion | null {
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

export function toCardKind(v: unknown): 'word' | 'study' {
	return v === 'study' ? 'study' : 'word';
}

export function toCardPack(
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

export async function fetchCardPacks(
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
			 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
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

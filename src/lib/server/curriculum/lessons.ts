import { readLessonContent } from '../../curriculum/lesson-content';
import type { D1Database } from '@cloudflare/workers-types';
import { publishedLevelSql } from './curriculum-publication';
import type { HomeStats, LessonPage, Quiz, QuizQuestion, Suggestion } from '$lib/curriculum/curriculum';
import { learningDay, summarizeActivity } from '$lib/deck/learning-activity';
import {
	parseQuestion,
	resolveDb,
	type DbOrEvent,
	type QuestionRow,
	type QuizRow
} from './shared';

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
				`SELECT le.id, le.title, COALESCE(le.body_md, '') AS body_md, le.content_json,
				m.id AS material_id, m.title AS material_title,
				l.id AS level_id, l.title AS level_title,
				s.id AS subject_id, s.title AS subject_title
			 FROM lessons le
			 JOIN materials m ON m.id = le.material_id
			 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
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
				content_json: string | null;
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
							COALESCE(correct_answer, '') AS correct_answer,
							COALESCE(section_slug, '') AS section_slug
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
		lesson: { id: lesson.id, title: lesson.title, body_md: lesson.body_md ?? '', content: readLessonContent(lesson.content_json) },
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
	const now = Date.now();
	await db.batch([
		db.prepare(
			`INSERT OR REPLACE INTO lesson_progress (user_id, lesson_id, done, score, total, updated_at, event_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(userId, lessonId, done ? 1 : 0, score, total, Math.floor(now / 1000), now),
		db.prepare(`INSERT OR IGNORE INTO learning_days (user_id, day) VALUES (?, ?)`)
			.bind(userId, learningDay(now))
	]);
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
	const now = Date.now();
	const today = learningDay(now);
	const [lessons, cards, history] = await Promise.all([
		db.prepare(`SELECT done, updated_at FROM lesson_progress WHERE user_id = ?`)
			.bind(userId).all<{ done: number; updated_at: number }>(),
		db.prepare(`SELECT DISTINCT updated_at FROM card_progress WHERE user_id = ? AND seen > 0`)
			.bind(userId).all<{ updated_at: string }>(),
		db.prepare(`SELECT day FROM learning_days WHERE user_id = ?`)
			.bind(userId).all<{ day: string }>()
	]);
	const activeDays = new Set<string>();
	let todayDone = 0;
	for (const r of lessons.results ?? []) {
		const timestamp = progressToMs(Number(r.updated_at));
		if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now) continue;
		const day = learningDay(timestamp);
		activeDays.add(day);
		if (Number(r.done) === 1 && day === today) todayDone++;
	}
	for (const r of cards.results ?? []) {
		const timestamp = Date.parse(r.updated_at);
		if (Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now) activeDays.add(learningDay(timestamp));
	}
	const storedDays = new Set((history.results ?? []).map((r) => r.day));
	// A régi haladási adatokból visszanyerhető napokat egyszer megőrizzük.
	const recovered = [...activeDays].filter((day) => !storedDays.has(day));
	for (let offset = 0; offset < recovered.length; offset += 80) {
		await db.batch(recovered.slice(offset, offset + 80).map((day) =>
			db.prepare(`INSERT OR IGNORE INTO learning_days (user_id, day) VALUES (?, ?)`).bind(userId, day)
		));
	}
	return { ...summarizeActivity([...activeDays, ...storedDays], now), todayDone };
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
			 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
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

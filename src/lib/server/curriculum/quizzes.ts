import { publishedLevelSql } from './curriculum-publication';
import type { Package, QuizQuestion } from '$lib/curriculum/curriculum';
import {
	parseQuestion,
	resolveDb,
	type DbOrEvent,
	type PackageRow,
	type QuestionRow
} from './shared';

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
			 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
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
							COALESCE(correct_answer, '') AS correct_answer,
							COALESCE(section_slug, '') AS section_slug
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
			 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
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
				COALESCE(correct_answer, '') AS correct_answer,
				COALESCE(section_slug, '') AS section_slug
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

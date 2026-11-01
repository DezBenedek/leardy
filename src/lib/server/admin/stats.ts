// Iskola statisztika lekérdezések. Minden függvény school_id szerint szűr.
// Csak összesítés, egyéni adat a részletezőben lapozva jön.

import type { D1Database } from '@cloudflare/workers-types';

export interface SchoolOverview {
	schoolId: string;
	rangeDays: number;
	students: number;
	teachers: number;
	activeStudents: number;
	lessonsDone: number;
	avgScore: number | null;
	submissions: number;
	submissionRate: number | null;
	streakAvg: number;
	topTopics: { materialId: string; title: string; done: number }[];
	weakTopics: { materialId: string; title: string; done: number }[];
}

export async function schoolOverview(db: D1Database, schoolId: string, rangeDays: number): Promise<SchoolOverview> {
	const since = Date.now() - rangeDays * 24 * 3600 * 1000;
	const counts = await db
		.prepare(
			`SELECT
				SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students,
				SUM(CASE WHEN role = 'teacher' THEN 1 ELSE 0 END) AS teachers,
				COALESCE(AVG(CASE WHEN role = 'student' THEN streak ELSE NULL END), 0) AS streak_avg
			 FROM users WHERE school_id = ?`
		)
		.bind(schoolId)
		.first<{ students: number; teachers: number; streak_avg: number }>()
		.catch(() => ({ students: 0, teachers: 0, streak_avg: 0 }));
	const activity = await db
		.prepare(
			`SELECT COUNT(DISTINCT lp.user_id) AS active_students, COUNT(*) AS lessons_done,
				AVG(CASE WHEN lp.total > 0 THEN (lp.score * 1.0 / lp.total) ELSE NULL END) AS avg_score
			 FROM lesson_progress lp JOIN users u ON u.id = lp.user_id
			 WHERE u.school_id = ? AND u.role = 'student' AND lp.updated_at >= ?`
		)
		.bind(schoolId, since)
		.first<{ active_students: number; lessons_done: number; avg_score: number | null }>()
		.catch(() => ({ active_students: 0, lessons_done: 0, avg_score: null }));
	const subs = await db
		.prepare(
			`SELECT COUNT(*) AS total,
				SUM(CASE WHEN submitted = 1 THEN 1 ELSE 0 END) AS done_count
			 FROM task_submissions WHERE user_id IN (SELECT id FROM users WHERE school_id = ? AND role = 'student')
			 AND updated_at >= ?`
		)
		.bind(schoolId, since)
		.first<{ total: number; done_count: number }>()
		.catch(() => ({ total: 0, done_count: 0 }));
	const topics = await db
		.prepare(
			`SELECT m.id AS material_id, m.title AS title, COUNT(lp.user_id) AS done
			 FROM lesson_progress lp
			 JOIN lessons le ON le.id = lp.lesson_id
			 JOIN materials m ON m.id = le.material_id
			 JOIN users u ON u.id = lp.user_id
			 WHERE u.school_id = ? AND u.role = 'student' AND lp.done = 1 AND lp.updated_at >= ?
			 GROUP BY m.id ORDER BY done DESC LIMIT 10`
		)
		.bind(schoolId, since)
		.all<{ material_id: string; title: string; done: number }>()
		.catch(() => ({ results: [] }));
	const rows = topics.results ?? [];
	return {
		schoolId,
		rangeDays,
		students: counts?.students ?? 0,
		teachers: counts?.teachers ?? 0,
		activeStudents: activity?.active_students ?? 0,
		lessonsDone: activity?.lessons_done ?? 0,
		avgScore: activity?.avg_score ?? null,
		submissions: subs?.total ?? 0,
		submissionRate: subs && subs.total > 0 ? (subs.done_count ?? 0) / subs.total : null,
		streakAvg: Math.round(((counts?.streak_avg ?? 0) + Number.EPSILON) * 10) / 10,
		topTopics: rows.slice(0, 5),
		weakTopics: [...rows].reverse().slice(0, 5)
	};
}

export interface SchoolStudent {
	id: string;
	name: string;
	email: string;
	xp: number;
	streak: number;
	lessonsDone: number;
	lastActive: number | null;
	suspended: boolean;
	muted: boolean;
	classes: number;
}

export async function schoolStudents(
	db: D1Database,
	schoolId: string,
	query: string,
	limit = 30,
	offset = 0,
	role: 'student' | 'teacher' = 'student'
): Promise<{ items: SchoolStudent[]; total: number }> {
	const needle = `%${query.trim().toLowerCase()}%`;
	const where = query.trim()
		? `AND (instr(lower(u.name), ?) > 0 OR instr(lower(u.email), ?) > 0)`
		: '';
	const bindArgs = query.trim() ? [schoolId, role, needle, needle] : [schoolId, role];
	const total = await db
		.prepare(`SELECT COUNT(*) AS n FROM users u WHERE u.school_id = ? AND u.role = ? ${where}`)
		.bind(...bindArgs)
		.first<{ n: number }>()
		.catch(() => ({ n: 0 }));
	const rows = await db
		.prepare(
			`SELECT u.id, u.name, u.email, COALESCE(u.xp, 0) AS xp, COALESCE(u.streak, 0) AS streak,
				COALESCE(u.suspended_until, 0) AS suspended_until, COALESCE(u.muted_until, 0) AS muted_until,
				(SELECT COUNT(*) FROM lesson_progress lp WHERE lp.user_id = u.id AND lp.done = 1) AS lessons_done,
				(SELECT MAX(lp.updated_at) FROM lesson_progress lp WHERE lp.user_id = u.id) AS last_active,
				(SELECT COUNT(*) FROM classrooms c WHERE c.teacher_id = u.id) AS classes
			 FROM users u WHERE u.school_id = ? AND u.role = ? ${where}
			 ORDER BY last_active DESC NULLS LAST, u.name LIMIT ? OFFSET ?`
		)
		.bind(...bindArgs, limit, offset)
		.all<{
			id: string; name: string; email: string; xp: number; streak: number;
			lessons_done: number; last_active: number | null; suspended_until: number;
			muted_until: number; classes: number;
		}>()
		.catch(() => ({ results: [] }));
	const now = Date.now();
	return {
		total: total?.n ?? 0,
		items: (rows.results ?? []).map((r) => ({
			id: r.id,
			name: r.name,
			email: r.email,
			xp: r.xp,
			streak: r.streak,
			lessonsDone: r.lessons_done,
			lastActive: r.last_active,
			suspended: r.suspended_until > now,
			muted: r.muted_until > now,
			classes: r.classes ?? 0
		}))
	};
}

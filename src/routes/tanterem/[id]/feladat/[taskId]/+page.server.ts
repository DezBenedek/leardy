import { error, redirect, type NumericRange } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb, getSessionUser } from '$lib/server/db';
import type { ClassTask } from '$lib/server/classroom';

export interface TaskLesson {
	id: string;
	title: string;
}

export interface TaskResultRow {
	user_id: string;
	name: string;
	best_score: number | null;
	best_total: number | null;
	best_pct: number | null;
	attempts: number | null;
	submitted: number | null;
	submitted_at: number | null;
}

function parseLessons(raw: string): TaskLesson[] {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed
			.map((l) => {
				if (typeof l === 'string') return { id: l, title: 'Lecke' };
				const o = l as { id?: unknown; title?: unknown };
				return { id: String(o.id ?? ''), title: String(o.title ?? 'Lecke') };
			})
			.filter((l) => l.id);
	} catch {
		return [];
	}
}

export const load: PageServerLoad = async (event) => {
	const db = getDb(event);
	if (!db) throw error(503 as NumericRange<400, 599>, 'Az adatbázis most nem elérhető.');
	const user = await getSessionUser(event, db);
	if (!user) throw error(401 as NumericRange<400, 599>, 'Jelentkezz be!');
	const roomId = event.params.id;
	const taskId = event.params.taskId;

	const room = await db
		.prepare(`SELECT id, teacher_id, name FROM classrooms WHERE id = ?`)
		.bind(roomId)
		.first<{ id: string; teacher_id: string; name: string }>();
	if (!room) throw error(404 as NumericRange<400, 599>, 'Nincs ilyen osztály.');
	if (room.teacher_id !== user.id) throw redirect(303, `/tanterem/${roomId}`);

	const task = await db
		.prepare(
			`SELECT id, classroom_id, teacher_id, title, lesson_ids_json, question_count,
				target_pct, shuffle, due_date, created_at
			 FROM classroom_tasks WHERE id = ? AND classroom_id = ?`
		)
		.bind(taskId, roomId)
		.first<ClassTask>();
	if (!task) throw error(404 as NumericRange<400, 599>, 'Nincs ilyen feladat.');

	const results = await db
		.prepare(
			`SELECT u.id AS user_id, u.name AS name,
				s.best_score, s.best_total, s.best_pct, s.attempts, s.submitted, s.submitted_at
			 FROM classroom_members m
			 JOIN users u ON u.id = m.user_id
			 LEFT JOIN task_submissions s ON s.task_id = ? AND s.user_id = u.id
			 WHERE m.classroom_id = ? ORDER BY u.name LIMIT 500`
		)
		.bind(taskId, roomId)
		.all<TaskResultRow>();

	return {
		room: { id: room.id, name: room.name },
		task,
		lessons: parseLessons(task.lesson_ids_json ?? '[]'),
		results: results.results ?? []
	};
};

import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassContentSchema } from '$lib/server/classroom';

/* Osztaly statisztika: csak a sajat tanar.
 * Tagokkent: kviz probalkozas/bekuldes/atlag, beadando bekuldes/ertekeles atlag.
 * Feladatonkent es beadandonként: bekuldesi arany. */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';

	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(id)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (room.teacher_id !== user.id)
		return json({ error: 'Csak az osztály tanára láthatja.' }, { status: 403 });

	const members = await db
		.prepare(
			`SELECT u.id AS user_id, u.name AS name, m.joined_at AS joined_at
			 FROM classroom_members m JOIN users u ON u.id = m.user_id
			 WHERE m.classroom_id = ? ORDER BY u.name LIMIT 500`
		)
		.bind(id)
		.all<{ user_id: string; name: string; joined_at: number }>();
	const memberRows = members.results ?? [];

	const tasks = await db
		.prepare(`SELECT id, title, due_date, created_at FROM classroom_tasks WHERE classroom_id = ? ORDER BY created_at DESC LIMIT 100`)
		.bind(id)
		.all<{ id: string; title: string; due_date: number | null; created_at: number }>();
	const taskRows = tasks.results ?? [];

	const assignments = await db
		.prepare(`SELECT id, title, due_date, created_at FROM classroom_assignments WHERE classroom_id = ? ORDER BY created_at DESC LIMIT 100`)
		.bind(id)
		.all<{ id: string; title: string; due_date: number | null; created_at: number }>();
	const assignRows = assignments.results ?? [];

	const taskSubs = await db
		.prepare(
			`SELECT user_id, task_id, best_pct, attempts, submitted, submitted_at
			 FROM task_submissions WHERE classroom_id = ? LIMIT 5000`
		)
		.bind(id)
		.all<{ user_id: string; task_id: string; best_pct: number; attempts: number; submitted: number; submitted_at: number | null }>();
	const assignSubs = await db
		.prepare(
			`SELECT user_id, assignment_id, submitted, submitted_at, grade
			 FROM assignment_submissions WHERE classroom_id = ? LIMIT 5000`
		)
		.bind(id)
		.all<{ user_id: string; assignment_id: string; submitted: number; submitted_at: number | null; grade: number | null }>();

	const taskByUser = new Map<string, { attempted: number; submitted: number; pcts: number[] }>();
	for (const s of taskSubs.results ?? []) {
		const e = taskByUser.get(s.user_id) ?? { attempted: 0, submitted: 0, pcts: [] };
		if ((s.attempts ?? 0) > 0) {
			e.attempted += 1;
			e.pcts.push(s.best_pct ?? 0);
		}
		if ((s.submitted ?? 0) === 1) e.submitted += 1;
		taskByUser.set(s.user_id, e);
	}
	const assignByUser = new Map<string, { submitted: number; grades: number[] }>();
	for (const s of assignSubs.results ?? []) {
		const e = assignByUser.get(s.user_id) ?? { submitted: 0, grades: [] };
		if ((s.submitted ?? 0) === 1) e.submitted += 1;
		if (s.grade !== null && s.grade !== undefined) e.grades.push(s.grade);
		assignByUser.set(s.user_id, e);
	}
	const taskRate = new Map<string, { attempted: number; submitted: number }>();
	for (const s of taskSubs.results ?? []) {
		const e = taskRate.get(s.task_id) ?? { attempted: 0, submitted: 0 };
		if ((s.attempts ?? 0) > 0) e.attempted += 1;
		if ((s.submitted ?? 0) === 1) e.submitted += 1;
		taskRate.set(s.task_id, e);
	}
	const assignRate = new Map<string, { submitted: number; graded: number }>();
	for (const s of assignSubs.results ?? []) {
		const e = assignRate.get(s.assignment_id) ?? { submitted: 0, graded: 0 };
		if ((s.submitted ?? 0) === 1) e.submitted += 1;
		if (s.grade !== null && s.grade !== undefined) e.graded += 1;
		assignRate.set(s.assignment_id, e);
	}

	const avg = (xs: number[]): number | null =>
		xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;

	const students = memberRows.map((m) => {
		const t = taskByUser.get(m.user_id);
		const a = assignByUser.get(m.user_id);
		return {
			user_id: m.user_id,
			name: m.name,
			joined_at: m.joined_at,
			tasks_attempted: t?.attempted ?? 0,
			tasks_submitted: t?.submitted ?? 0,
			tasks_avg_pct: avg(t?.pcts ?? []),
			assignments_submitted: a?.submitted ?? 0,
			assignments_avg_grade: avg(a?.grades ?? [])
		};
	});

	return json({
		member_count: memberRows.length,
		task_count: taskRows.length,
		assignment_count: assignRows.length,
		students,
		tasks: taskRows.map((t) => ({
			...t,
			attempted: taskRate.get(t.id)?.attempted ?? 0,
			submitted: taskRate.get(t.id)?.submitted ?? 0
		})),
		assignments: assignRows.map((a) => ({
			...a,
			submitted: assignRate.get(a.id)?.submitted ?? 0,
			graded: assignRate.get(a.id)?.graded ?? 0
		}))
	});
};

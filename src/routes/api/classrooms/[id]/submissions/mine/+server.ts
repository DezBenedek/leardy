import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassContentSchema } from '$lib/server/classroom';

/* Diák saját beküldés-állapota minden feladathoz (falon a kész jelöléshez).
   Tanárnak üres map (tanár nem tölt ki). */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroomId = event.params.id ?? '';

	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(classroomId)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (room.teacher_id === user.id) return json({ mine: {} }, { status: 200 });

	const member = await db
		.prepare(`SELECT user_id FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
		.bind(classroomId, user.id)
		.first<{ user_id: string }>();
	if (!member) return json({ error: 'Nem vagy az osztály tagja.' }, { status: 403 });

	const rows = await db
		.prepare(
			`SELECT task_id, best_pct, submitted FROM task_submissions
			 WHERE classroom_id = ? AND user_id = ?`
		)
		.bind(classroomId, user.id)
		.all<{ task_id: string; best_pct: number; submitted: number }>();
	const mine: Record<string, { best_pct: number; submitted: boolean }> = {};
	for (const r of rows.results ?? []) mine[r.task_id] = { best_pct: r.best_pct, submitted: r.submitted === 1 };

	/** Beadandok: falon a jegy/pipa jelvenyhez (submitted + erdemjegy). */
	const arows = await db
		.prepare(
			`SELECT assignment_id, submitted, grade FROM assignment_submissions
			 WHERE classroom_id = ? AND user_id = ?`
		)
		.bind(classroomId, user.id)
		.all<{ assignment_id: string; submitted: number; grade: number | null }>();
	const assignments: Record<string, { submitted: boolean; grade: number | null }> = {};
	for (const r of arows.results ?? [])
		assignments[r.assignment_id] = { submitted: r.submitted === 1, grade: r.grade ?? null };
	return json({ mine, assignments }, { status: 200 });
};

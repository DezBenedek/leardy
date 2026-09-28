import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassContentSchema } from '$lib/server/classroom';

/* Feladat szerkesztése: csak a saját tanár.
   Cím, kérdésszám, célszázalék, határidő (leckék és sorrend nem változik). */
export const PATCH: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroomId = event.params.id ?? '';
	const taskId = event.params.taskId ?? '';

	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(classroomId)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (room.teacher_id !== user.id)
		return json({ error: 'Csak az osztály tanára szerkeszthet.' }, { status: 403 });

	const task = await db
		.prepare(`SELECT id FROM classroom_tasks WHERE id = ? AND classroom_id = ?`)
		.bind(taskId, classroomId)
		.first<{ id: string }>();
	if (!task) return json({ error: 'Nincs ilyen feladat.' }, { status: 404 });

	let body: {
		title?: unknown;
		question_count?: unknown;
		target_pct?: unknown;
		due_date?: unknown;
	};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const title = String(body.title ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
	const questionCount = Math.round(Number(body.question_count));
	const targetPct = Math.round(Number(body.target_pct));
	let dueDate: number | null = null;
	if (body.due_date !== null && body.due_date !== undefined && String(body.due_date) !== '') {
		const t = Number(body.due_date);
		if (!Number.isFinite(t) || t <= 0) return json({ error: 'Hibás határidő.' }, { status: 400 });
		dueDate = Math.round(t);
	}
	if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100)
		return json({ error: 'A kérdésszám 1 és 100 között legyen!' }, { status: 400 });
	if (!Number.isInteger(targetPct) || targetPct < 10 || targetPct > 100)
		return json({ error: 'A célszázalék 10 és 100 között legyen!' }, { status: 400 });

	await db
		.prepare(
			`UPDATE classroom_tasks SET title = ?, question_count = ?, target_pct = ?, due_date = ?
			 WHERE id = ?`
		)
		.bind(title, questionCount, targetPct, dueDate, taskId)
		.run();
	return json({ ok: true, title, question_count: questionCount, target_pct: targetPct, due_date: dueDate }, { status: 200 });
};

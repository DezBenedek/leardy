import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassContentSchema } from '$lib/server/classroom';
import { notifyClassroom } from '$lib/server/push';

/* Feladat kiosztása: kvíz leckékből. Csak a saját tanár.
   Body: { title?, lesson_ids: string[], question_count, target_pct, shuffle, due_date? }
   due_date: ezredmásodperces időbélyeg vagy null (üres = nincs határidő). */
export const POST: RequestHandler = async (event) => {
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
		return json({ error: 'Csak az osztály tanára oszthat ki feladatot.' }, { status: 403 });

	let body: {
		title?: unknown;
		lesson_ids?: unknown;
		lessons?: unknown;
		question_count?: unknown;
		target_pct?: unknown;
		shuffle?: unknown;
		due_date?: unknown;
	};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	// Leckék: { id, title } párok (cím-pillanatkép a falhoz), legfeljebb 20.
	let lessons: { id: string; title: string }[] = [];
	if (Array.isArray(body.lessons)) {
		const seen = new Set<string>();
		for (const l of body.lessons) {
			const id = String((l as { id?: unknown })?.id ?? '').trim();
			if (!id || seen.has(id)) continue;
			seen.add(id);
			lessons.push({ id, title: String((l as { title?: unknown })?.title ?? 'Lecke').slice(0, 120) });
			if (lessons.length >= 20) break;
		}
	} else {
		const ids = Array.isArray(body.lesson_ids)
			? [...new Set(body.lesson_ids.map((l) => String(l)).filter(Boolean))].slice(0, 20)
			: [];
		lessons = ids.map((id) => ({ id, title: 'Lecke' }));
	}
	const questionCount = Math.round(Number(body.question_count));
	const targetPct = Math.round(Number(body.target_pct));
	const shuffle = body.shuffle === false || body.shuffle === 0 || body.shuffle === 'fixed' ? 0 : 1;
	const title = String(body.title ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
	let dueDate: number | null = null;
	if (body.due_date !== null && body.due_date !== undefined && String(body.due_date) !== '') {
		const t = Number(body.due_date);
		if (!Number.isFinite(t) || t <= 0) return json({ error: 'Hibás határidő.' }, { status: 400 });
		dueDate = Math.round(t);
	}

	if (lessons.length === 0) return json({ error: 'Válassz legalább egy leckét!' }, { status: 400 });
	if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100)
		return json({ error: 'A kérdésszám 1 és 100 között legyen!' }, { status: 400 });
	if (!Number.isInteger(targetPct) || targetPct < 10 || targetPct > 100)
		return json({ error: 'A célszázalék 10 és 100 között legyen!' }, { status: 400 });

	const taskId = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO classroom_tasks
				(id, classroom_id, teacher_id, title, lesson_ids_json, question_count, target_pct, shuffle, due_date, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			taskId, id, user.id, title,
			JSON.stringify(lessons), questionCount, targetPct, shuffle, dueDate, Date.now()
		)
		.run();
	void notifyClassroom(db, {
		classroomId: id,
		excludeUserId: user.id,
		title: 'Új tantermi feladat',
		body: title || 'Új kvízfeladat érkezett.',
		url: `/tanterem/${id}`,
		tag: `task:${taskId}`
	});
	return json({ ok: true, id: taskId }, { status: 201 });
};

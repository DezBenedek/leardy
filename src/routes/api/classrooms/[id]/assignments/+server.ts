import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { fireNotify, notifyClassroom } from '$lib/server/push';

/* Beadando letrehozasa: csak a sajat tanar.
   Body: { title, description?, due_date?, require_text?, min_chars?,
     require_images?, max_images?, require_files?, max_files? } */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';

	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(id)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (room.teacher_id !== user.id)
		return json({ error: 'Csak az osztály tanára hozhat létre beadandót.' }, { status: 403 });

	let body: {
		title?: unknown;
		description?: unknown;
		due_date?: unknown;
		require_text?: unknown;
		require_images?: unknown;
		require_files?: unknown;
		require_audio?: unknown;
	};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}

	const title = String(body.title ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
	const description = String(body.description ?? '').trim().slice(0, 2000);
	if (title.length < 3) return json({ error: 'Adj legalább 3 karakteres címet!' }, { status: 400 });

	let dueDate: number | null = null;
	if (body.due_date !== null && body.due_date !== undefined && String(body.due_date) !== '') {
		const t = Number(body.due_date);
		if (!Number.isFinite(t) || t <= 0) return json({ error: 'Hibás határidő.' }, { status: 400 });
		dueDate = Math.round(t);
	}

	const requireText = body.require_text === false || body.require_text === 0 ? 0 : 1;
	const requireImages = body.require_images === true || body.require_images === 1 ? 1 : 0;
	const requireFiles = body.require_files === true || body.require_files === 1 ? 1 : 0;
	const requireAudio = body.require_audio === true || body.require_audio === 1 ? 1 : 0;

	if (!requireText && !requireImages && !requireFiles && !requireAudio)
		return json({ error: 'Válassz legalább egy követelményt: szöveg, kép, hang vagy fájl!' }, { status: 400 });

	const aid = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO classroom_assignments
				(id, classroom_id, teacher_id, title, description, due_date,
				 require_text, min_chars, require_images, max_images,
				 require_files, max_files, require_audio, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			aid, id, user.id, title, description, dueDate,
			requireText, 0, requireImages, 0,
			requireFiles, 0, requireAudio, Date.now()
		)
		.run();
	fireNotify(event, notifyClassroom(db, {
		classroomId: id,
		excludeUserId: user.id,
		title: 'Új beadandó',
		body: title,
		url: `/tanterem/${id}`,
		tag: `assign:${aid}`,
		kind: 'assignment'
	}));
	return json({ ok: true, id: aid }, { status: 201 });
};

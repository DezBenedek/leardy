import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';

/* Beadando szerkesztese / torlese: csak a sajat tanar. */
export const PATCH: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroomId = event.params.id ?? '';
	const aid = event.params.aid ?? '';

	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(classroomId)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (room.teacher_id !== user.id)
		return json({ error: 'Csak az osztály tanára szerkeszthet.' }, { status: 403 });

	const existing = await db
		.prepare(`SELECT id FROM classroom_assignments WHERE id = ? AND classroom_id = ?`)
		.bind(aid, classroomId)
		.first<{ id: string }>();
	if (!existing) return json({ error: 'Nincs ilyen beadandó.' }, { status: 404 });

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

	await db
		.prepare(
			`UPDATE classroom_assignments
			 SET title = ?, description = ?, due_date = ?,
				 require_text = ?, min_chars = 0,
				 require_images = ?, max_images = 0,
				 require_files = ?, max_files = 0,
				 require_audio = ?
			 WHERE id = ?`
		)
		.bind(
			title, description, dueDate,
			requireText, requireImages,
			requireFiles, requireAudio, aid
		)
		.run();
	return json(
		{
			ok: true, title, description, due_date: dueDate,
			require_text: requireText, min_chars: 0,
			require_images: requireImages, max_images: 0,
			require_files: requireFiles, max_files: 0,
			require_audio: requireAudio
		},
		{ status: 200 }
	);
};

export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroomId = event.params.id ?? '';
	const aid = event.params.aid ?? '';

	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(classroomId)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (room.teacher_id !== user.id)
		return json({ error: 'Csak az osztály tanára törölhet.' }, { status: 403 });

	// R2 kulcsok begyűjtése a torles elott (a bucket torles best-effort).
	const uploads = await db
		.prepare(`SELECT r2_key FROM assignment_uploads WHERE assignment_id = ?`)
		.bind(aid)
		.all<{ r2_key: string }>();

	await db.batch([
		db.prepare(`DELETE FROM assignment_uploads WHERE assignment_id = ?`).bind(aid),
		db.prepare(`DELETE FROM assignment_submissions WHERE assignment_id = ?`).bind(aid),
		db.prepare(`DELETE FROM classroom_assignments WHERE id = ? AND classroom_id = ?`).bind(aid, classroomId)
	]);

	try {
		const bucket = (event.platform?.env as { UPLOADS?: { delete: (k: string) => Promise<void> } } | undefined)?.UPLOADS;
		if (bucket) {
			for (const u of uploads.results ?? []) {
				try {
					await bucket.delete(u.r2_key);
				} catch {
					// egyedi fajl torles hiba nem akadaly
				}
			}
		}
	} catch {
		// R2 nelkul is jo (pl. lokal dev DB nelkul)
	}
	return json({ ok: true }, { status: 200 });
};

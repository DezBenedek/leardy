import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassContentSchema, type AssignmentUpload } from '$lib/server/classroom';
import { getUploadsBucket, guessMediaMime, parseRange } from '$lib/server/uploads';

/* Egy feltöltés letöltése (kép / hang / fájl) vagy törlése.
   A hang- és képlejátszáshoz HTTP Range kéréseket is kiszolgál (206),
   mert a Safari médiaelemei enélkül hibát mutatnak. */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroomId = event.params.id ?? '';
	const aid = event.params.aid ?? '';
	const uploadId = event.params.uploadId ?? '';

	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(classroomId)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	const own = room.teacher_id === user.id;
	if (!own) {
		const member = await db
			.prepare(`SELECT user_id FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
			.bind(classroomId, user.id)
			.first();
		if (!member) return json({ error: 'Nem vagy az osztály tagja.' }, { status: 403 });
	}

	const upload = await db
		.prepare(`SELECT * FROM assignment_uploads WHERE id = ? AND assignment_id = ? AND classroom_id = ?`)
		.bind(uploadId, aid, classroomId)
		.first<AssignmentUpload>();
	if (!upload) return json({ error: 'Nincs ilyen fájl.' }, { status: 404 });
	if (!own && upload.user_id !== user.id)
		return json({ error: 'Ezt a fájlt nem nézheted meg.' }, { status: 403 });

	const bucket = getUploadsBucket(event);
	if (!bucket) return json({ error: 'A fájltár most nem elérhető.' }, { status: 503 });

	const total = upload.size > 0 ? upload.size : undefined;
	const mime = guessMediaMime(upload.file_name, upload.mime);

	const baseHeaders = new Headers();
	baseHeaders.set('content-type', mime);
	baseHeaders.set('cache-control', 'private, max-age=3600');
	baseHeaders.set('accept-ranges', 'bytes');
	if (upload.kind !== 'image' && upload.kind !== 'audio') {
		const ascii = upload.file_name.replace(/[^\x20-\x7E]+/g, '_');
		baseHeaders.set('content-disposition', `attachment; filename="${ascii}"`);
	}

	const rangeHeader = event.request.headers.get('range');
	if (rangeHeader && total !== undefined) {
		const range = parseRange(rangeHeader, total);
		if (!range) {
			const headers = new Headers(baseHeaders);
			headers.set('content-range', `bytes */${total}`);
			return new Response('Kért tartomány nem elérhető.', { status: 416, headers });
		}
		const obj = await bucket.get(upload.r2_key, { range: { offset: range.offset, length: range.length } });
		if (!obj) return json({ error: 'A fájl már nem elérhető.' }, { status: 404 });
		const headers = new Headers(baseHeaders);
		headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${total}`);
		headers.set('content-length', String(range.length));
		return new Response(obj.body as unknown as ReadableStream, { status: 206, headers });
	}

	const obj = await bucket.get(upload.r2_key);
	if (!obj) return json({ error: 'A fájl már nem elérhető.' }, { status: 404 });
	const headers = new Headers(baseHeaders);
	headers.set('content-length', String(obj.size ?? total ?? 0));
	return new Response(obj.body as unknown as ReadableStream, { status: 200, headers });
};

export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroomId = event.params.id ?? '';
	const aid = event.params.aid ?? '';
	const uploadId = event.params.uploadId ?? '';

	const upload = await db
		.prepare(`SELECT * FROM assignment_uploads WHERE id = ? AND assignment_id = ? AND classroom_id = ?`)
		.bind(uploadId, aid, classroomId)
		.first<AssignmentUpload>();
	if (!upload) return json({ error: 'Nincs ilyen fájl.' }, { status: 404 });
	if (upload.user_id !== user.id)
		return json({ error: 'Csak a saját feltöltésed törölheted.' }, { status: 403 });

	const assignment = await db
		.prepare(`SELECT due_date FROM classroom_assignments WHERE id = ?`)
		.bind(aid)
		.first<{ due_date: number | null }>();
	if (assignment?.due_date && Date.now() > assignment.due_date)
		return json({ error: 'Határidő után már nem törölhetsz.' }, { status: 403 });

	const sub = await db
		.prepare(`SELECT submitted FROM assignment_submissions WHERE assignment_id = ? AND user_id = ?`)
		.bind(aid, user.id)
		.first<{ submitted: number }>();
	if (sub?.submitted === 1)
		return json({ error: 'Beküldés után már nem törölhetsz. Előbb vond vissza a beküldést!' }, { status: 403 });

	await db.prepare(`DELETE FROM assignment_uploads WHERE id = ?`).bind(uploadId).run();
	try {
		await getUploadsBucket(event)?.delete(upload.r2_key);
	} catch {
		// DB torles mar megvan
	}
	return json({ ok: true }, { status: 200 });
};

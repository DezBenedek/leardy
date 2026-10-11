import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassContentSchema } from '$lib/server/classroom';
import { extFor, getUploadsBucket, MAX_AUDIO_BYTES, MAX_UPLOAD_BYTES, safeFileName } from '$lib/server/uploads';

/* Kép / hang / fájl feltöltése R2-be. Multipart form: { kind: 'image' | 'audio' | 'file', file: File, width?, height? }
   A képet és a hangot a kliens már optimalizálja (tömörít, vág), a szerver csak ellenőriz és tárol.
   Darabszám-korlát nincs: kép, hang és fájl korlátlanul tölthető. */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroomId = event.params.id ?? '';
	const aid = event.params.aid ?? '';

	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(classroomId)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (room.teacher_id === user.id)
		return json({ error: 'Tanárként nem tölthetsz fel beadandót.' }, { status: 403 });
	const member = await db
		.prepare(`SELECT user_id FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
		.bind(classroomId, user.id)
		.first();
	if (!member) return json({ error: 'Nem vagy az osztály tagja.' }, { status: 403 });

	const assignment = await db
		.prepare(`SELECT id, due_date FROM classroom_assignments WHERE id = ? AND classroom_id = ?`)
		.bind(aid, classroomId)
		.first<{ id: string; due_date: number | null }>();
	if (!assignment) return json({ error: 'Nincs ilyen beadandó.' }, { status: 404 });
	if (assignment.due_date && Date.now() > assignment.due_date)
		return json({ error: 'A határidő lejárt, már nem tölthetsz fel.' }, { status: 403 });

	let form: FormData;
	try {
		form = await event.request.formData();
	} catch {
		return json({ error: 'Hibás feltöltés.' }, { status: 400 });
	}
	const kindRaw = String(form.get('kind') ?? 'file');
	const kind = kindRaw === 'image' ? 'image' : kindRaw === 'audio' ? 'audio' : 'file';
	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0)
		return json({ error: 'Válassz fájlt!' }, { status: 400 });
	const maxBytes = kind === 'audio' ? MAX_AUDIO_BYTES : MAX_UPLOAD_BYTES;
	if (file.size > maxBytes)
		return json(
			{ error: kind === 'audio' ? 'Túl nagy hangfájl: legfeljebb 25 MB lehet.' : 'Túl nagy fájl: legfeljebb 10 MB lehet.' },
			{ status: 400 }
		);

	if (kind === 'image' && !String(file.type).startsWith('image/'))
		return json({ error: 'Csak kép tölthető fel ide.' }, { status: 400 });
	if (kind === 'audio') {
		const t = String(file.type);
		const ok = t === '' || t.startsWith('audio/') || t === 'video/webm' || t === 'application/octet-stream';
		if (!ok) return json({ error: 'Csak hangfájl tölthető fel ide.' }, { status: 400 });
	}

	const bucket = getUploadsBucket(event);
	if (!bucket)
		return json({ error: 'A fájltár most nem elérhető (R2 hiányzik). Indítsd wrangler dev módban!' }, { status: 503 });

	const uploadId = crypto.randomUUID();
	const name = safeFileName(file.name || (kind === 'image' ? 'kep.jpg' : kind === 'audio' ? 'hangfelvetel.wav' : 'fajl'));
	const key = `assignments/${aid}/${user.id}/${uploadId}.${extFor(file.type, name)}`;
	const bytes = new Uint8Array(await file.arrayBuffer());
	await bucket.put(key, bytes, {
		httpMetadata: { contentType: file.type || 'application/octet-stream' }
	});

	let width: number | null = null;
	let height: number | null = null;
	if (kind === 'image') {
		const w = Math.round(Number(form.get('width')));
		const h = Math.round(Number(form.get('height')));
		if (Number.isInteger(w) && w > 0 && w <= 8000) width = w;
		if (Number.isInteger(h) && h > 0 && h <= 8000) height = h;
	}

	await db
		.prepare(
			`INSERT INTO assignment_uploads
				(id, assignment_id, classroom_id, user_id, kind, r2_key, file_name, mime, size, width, height, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			uploadId, aid, classroomId, user.id, kind, key, name,
			file.type || 'application/octet-stream', file.size, width, height, Date.now()
		)
		.run();

	return json(
		{
			ok: true,
			upload: {
				id: uploadId, assignment_id: aid, classroom_id: classroomId, user_id: user.id,
				kind, file_name: name, mime: file.type, size: file.size,
				width, height, created_at: Date.now()
			}
		},
		{ status: 201 }
	);
};

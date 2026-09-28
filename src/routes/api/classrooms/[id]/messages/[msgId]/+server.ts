import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassContentSchema } from '$lib/server/classroom';

/* Üzenet szerkesztése: csak a saját tanár. Cím + leírás (csatolmányok maradnak). */
export const PATCH: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroomId = event.params.id ?? '';
	const msgId = event.params.msgId ?? '';

	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(classroomId)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (room.teacher_id !== user.id)
		return json({ error: 'Csak az osztály tanára szerkeszthet.' }, { status: 403 });

	const msg = await db
		.prepare(`SELECT id FROM messages WHERE id = ? AND classroom_id = ?`)
		.bind(msgId, classroomId)
		.first<{ id: string }>();
	if (!msg) return json({ error: 'Nincs ilyen üzenet.' }, { status: 404 });

	let body: { title?: unknown; body?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const title = String(body.title ?? '').trim().replace(/\s+/g, ' ');
	const text = String(body.body ?? '').trim().slice(0, 2000);
	if (title.length < 3) return json({ error: 'Adj legalább 3 karakteres címet!' }, { status: 400 });
	if (title.length > 120) return json({ error: 'A cím legfeljebb 120 karakter lehet.' }, { status: 400 });

	await db.prepare(`UPDATE messages SET title = ?, body = ? WHERE id = ?`).bind(title, text, msgId).run();
	return json({ ok: true, title, body: text }, { status: 200 });
};

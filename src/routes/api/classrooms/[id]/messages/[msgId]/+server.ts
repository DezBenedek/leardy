import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { parseMessageAttachments } from '$lib/message-attachments';

/* Üzenet és csatolmányok szerkesztése: csak a saját tanár. */
export const PATCH: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
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

	let body: { title?: unknown; body?: unknown; refs?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const title = String(body.title ?? '').trim().replace(/\s+/g, ' ');
	const text = String(body.body ?? '').trim().slice(0, 2000);
	if (title.length < 3) return json({ error: 'Adj legalább 3 karakteres címet!' }, { status: 400 });
	if (title.length > 120) return json({ error: 'A cím legfeljebb 120 karakter lehet.' }, { status: 400 });

	if (body.refs !== undefined && !Array.isArray(body.refs))
		return json({ error: 'Hibás csatolmánylista.' }, { status: 400 });
	const refs = body.refs === undefined ? undefined : parseMessageAttachments(body.refs);
	if (refs) {
		const first = refs[0];
		await db.batch([
			db.prepare(`UPDATE messages SET title = ?, body = ?, ref_type = ?, ref_id = ?, ref_title = ? WHERE id = ?`)
				.bind(title, text, first?.ref_type ?? null, first?.ref_id ?? null, first?.ref_title ?? null, msgId),
			db.prepare(`DELETE FROM message_refs WHERE message_id = ?`).bind(msgId),
			...refs.map((r, i) => db.prepare(`INSERT INTO message_refs (message_id, ref_type, ref_id, ref_title, sort) VALUES (?, ?, ?, ?, ?)`)
				.bind(msgId, r.ref_type, r.ref_id, r.ref_title, i))
		]);
	} else {
		await db.prepare(`UPDATE messages SET title = ?, body = ? WHERE id = ?`).bind(title, text, msgId).run();
	}
	return json({ ok: true, title, body: text, ...(refs ? { refs } : {}) }, { status: 200 });
};

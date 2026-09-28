import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassContentSchema } from '$lib/server/classroom';

/* Tag kidobása az osztályból: csak a saját tanár, saját magát nem dobhatja ki. */
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	const memberId = event.params.userId ?? '';

	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(id)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (room.teacher_id !== user.id)
		return json({ error: 'Csak az osztály tanára dobhat ki tagot.' }, { status: 403 });
	if (!memberId || memberId === user.id)
		return json({ error: 'Magadat nem dobhatod ki.' }, { status: 400 });

	await db
		.prepare(`DELETE FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
		.bind(id, memberId)
		.run();
	return json({ ok: true });
};

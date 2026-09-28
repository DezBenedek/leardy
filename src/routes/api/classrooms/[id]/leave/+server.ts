import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassroomSchema } from '$lib/server/classroom';

/* Kilépés az osztályból: a tag saját magát lépteti ki.
   A tanár nem léphet ki a saját osztályából, azt törölni kell. */
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassroomSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';

	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(id)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (room.teacher_id === user.id)
		return json({ error: 'A saját osztályodból nem léphetsz ki, töröld inkább.' }, { status: 400 });

	await db
		.prepare(`DELETE FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
		.bind(id, user.id)
		.run();
	return json({ ok: true });
};

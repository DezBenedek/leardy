import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassContentSchema, generateClassCode } from '$lib/server/classroom';

/* Csatlakozókód újragenerálása: csak a saját tanár. */
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
		return json({ error: 'Csak az osztály tanára módosíthat.' }, { status: 403 });

	for (let attempt = 0; attempt < 5; attempt++) {
		const code = generateClassCode();
		try {
			await db.prepare(`UPDATE classrooms SET code = ? WHERE id = ?`).bind(code, id).run();
			return json({ ok: true, code });
		} catch {
			// kódütközés: újrageneráljuk
		}
	}
	return json({ error: 'Nem sikerült kódot generálni. Próbáld újra!' }, { status: 500 });
};

import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';

/* Osztálybeállítások: csak a saját tanár. PATCH { name?, subject?, description? }, DELETE. */
export const PATCH: RequestHandler = async (event) => {
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
		return json({ error: 'Csak az osztály tanára módosíthat.' }, { status: 403 });

	let body: { name?: unknown; subject?: unknown; description?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const updates: string[] = [];
	const values: (string | number)[] = [];
	if (body.name !== undefined) {
		const name = String(body.name).trim().replace(/\s+/g, ' ');
		if (name.length < 3) return json({ error: 'Adj legalább 3 karakteres nevet!' }, { status: 400 });
		if (name.length > 80) return json({ error: 'A név legfeljebb 80 karakter lehet.' }, { status: 400 });
		updates.push('name = ?');
		values.push(name);
	}
	if (body.subject !== undefined) {
		updates.push('subject = ?');
		values.push(String(body.subject).trim().replace(/\s+/g, ' ').slice(0, 80));
	}
	if (body.description !== undefined) {
		updates.push('description = ?');
		values.push(String(body.description).trim().slice(0, 500));
	}
	if (updates.length === 0) return json({ error: 'Nincs módosítás.' }, { status: 400 });

	values.push(id);
	await db.prepare(`UPDATE classrooms SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
	return json({ ok: true });
};

export const DELETE: RequestHandler = async (event) => {
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
		return json({ error: 'Csak az osztály tanára törölhet.' }, { status: 403 });

	await db.prepare(`DELETE FROM classrooms WHERE id = ?`).bind(id).run();
	return json({ ok: true });
};

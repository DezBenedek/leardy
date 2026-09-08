import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, makeClassCode, newId, requireUser } from '$lib/server/db';

// GET /api/classrooms — saját osztályaim (ahol tanítok vagy tag vagyok).
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const rows = await db
		.prepare(
			`SELECT c.id, c.name, COALESCE(c.subject, '') AS subject, c.code,
				(SELECT COUNT(*) FROM classroom_members m WHERE m.classroom_id = c.id) AS members,
				CASE WHEN c.teacher_id = ? THEN 1 ELSE 0 END AS mine
			 FROM classrooms c
			 LEFT JOIN classroom_members m ON m.classroom_id = c.id AND m.user_id = ?
			 WHERE c.teacher_id = ? OR m.user_id = ?
			 ORDER BY c.created_at DESC`
		)
		.bind(user.id, user.id, user.id, user.id)
		.all();
	return json({ classrooms: rows.results ?? [] });
};

// POST /api/classrooms { name, subject? } — új osztály (csak tanár).
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	if (user.role !== 'teacher') {
		return json({ error: 'Osztályt csak tanár hozhat létre. Válts szerepet a Beállításokban.' }, { status: 403 });
	}
	let body: { name?: unknown; subject?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const name = String(body.name ?? '').trim();
	const subject = String(body.subject ?? '').trim().slice(0, 40);
	if (name.length < 3) return json({ error: 'Adj legalább 3 karakteres nevet.' }, { status: 400 });
	if (!subject) return json({ error: 'Válassz tantárgyat.' }, { status: 400 });
	const id = newId();
	let code = makeClassCode();
	for (let i = 0; i < 5; i++) {
		const exists = await db.prepare(`SELECT id FROM classrooms WHERE code = ?`).bind(code).first();
		if (!exists) break;
		code = makeClassCode();
	}
	await db
		.prepare(`INSERT INTO classrooms (id, teacher_id, code, name, subject, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
		.bind(id, user.id, code, name, subject, Date.now())
		.run();
	return json({ classroom: { id, name, subject, code, mine: 1, members: 0 } }, { status: 201 });
};

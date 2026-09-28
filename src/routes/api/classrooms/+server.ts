import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import {
	ensureClassroomSchema,
	generateClassCode,
	isTeacher,
	type Classroom
} from '$lib/server/classroom';

/* Tantermek listája: tanárnak a sajátjai, diáknak a csatlakozottak. */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassroomSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });

	if (isTeacher(user)) {
		const teaching = await db
			.prepare(
				`SELECT c.id, c.teacher_id, u.name AS teacher_name, c.code, c.name,
					COALESCE(c.subject, '') AS subject, COALESCE(c.description, '') AS description,
					c.created_at, COUNT(m.user_id) AS member_count
				 FROM classrooms c
				 LEFT JOIN users u ON u.id = c.teacher_id
				 LEFT JOIN classroom_members m ON m.classroom_id = c.id
				 WHERE c.teacher_id = ?
				 GROUP BY c.id ORDER BY c.created_at DESC`
			)
			.bind(user.id)
			.all<Classroom>();
		return json({ teaching: teaching.results ?? [], joined: [] });
	}

	const joined = await db
		.prepare(
			`SELECT c.id, c.teacher_id, u.name AS teacher_name, c.code, c.name,
				COALESCE(c.subject, '') AS subject, COALESCE(c.description, '') AS description,
				c.created_at, COUNT(m2.user_id) AS member_count
			 FROM classroom_members m
			 JOIN classrooms c ON c.id = m.classroom_id
			 LEFT JOIN users u ON u.id = c.teacher_id
			 LEFT JOIN classroom_members m2 ON m2.classroom_id = c.id
			 WHERE m.user_id = ?
			 GROUP BY c.id ORDER BY c.created_at DESC`
		)
		.bind(user.id)
		.all<Classroom>();
	return json({ teaching: [], joined: joined.results ?? [] });
};

/* Tanterem létrehozása: csak tanár. Body: { name, subject?, description? } */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassroomSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	if (!isTeacher(user))
		return json({ error: 'Csak tanárok hozhatnak létre tantermet.' }, { status: 403 });

	let body: { name?: unknown; subject?: unknown; description?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
	const subject = String(body.subject ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
	const description = String(body.description ?? '').trim().slice(0, 500);
	if (name.length < 3) return json({ error: 'Adj legalább 3 karakteres nevet!' }, { status: 400 });
	if (name.length > 80) return json({ error: 'A név legfeljebb 80 karakter lehet.' }, { status: 400 });

	for (let attempt = 0; attempt < 5; attempt++) {
		const id = crypto.randomUUID();
		const code = generateClassCode();
		try {
			await db
				.prepare(
					`INSERT INTO classrooms (id, teacher_id, code, name, subject, description, created_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(id, user.id, code, name, subject, description, Date.now())
				.run();
			return json(
				{ classroom: { id, teacher_id: user.id, code, name, subject, description } },
				{ status: 201 }
			);
		} catch {
			// kódütközés: újrageneráljuk
		}
	}
	return json({ error: 'Nem sikerült kódot generálni. Próbáld újra!' }, { status: 500 });
};

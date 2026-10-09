import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import {
	getMessageRefs,
	isTeacher,
	type ClassAssignment,
	type ClassMessage,
	type ClassTask
} from '$lib/server/classroom';

/* Osztályfal: üzenetek + feladatok. Tag, saját tanár vagy bármely tanár olvashatja. */
export const GET: RequestHandler = async (event) => {
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

	const own = room.teacher_id === user.id;
	if (!own && !isTeacher(user)) {
		const membership = await db
			.prepare(`SELECT classroom_id FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
			.bind(id, user.id)
			.first();
		if (!membership) return json({ error: 'Nem vagy tagja ennek az osztálynak.' }, { status: 403 });
	}

	const messages = await db
		.prepare(
			`SELECT m.id, m.classroom_id, m.teacher_id, u.name AS teacher_name, m.title, m.body,
				m.link_url, m.ref_type, m.ref_id,
				COALESCE(m.ref_title, '') AS ref_title, m.created_at
			 FROM messages m LEFT JOIN users u ON u.id = m.teacher_id
			 WHERE m.classroom_id = ? ORDER BY m.created_at DESC LIMIT 100`
		)
		.bind(id)
		.all<ClassMessage>();
	const msgRows = messages.results ?? [];
	/** Több csatolmány üzenetenként (régi üzeneteknél üres marad). */
	const refsByMessage = await getMessageRefs(
		db,
		msgRows.map((m) => m.id)
	);
	const messagesOut = msgRows.map((m) => ({ ...m, refs: refsByMessage.get(m.id) ?? [] }));
	const tasks = await db
		.prepare(
			`SELECT t.id, t.classroom_id, t.teacher_id, u.name AS teacher_name, t.title,
				t.lesson_ids_json, t.question_count, t.target_pct, t.shuffle, t.due_date, t.created_at
			 FROM classroom_tasks t LEFT JOIN users u ON u.id = t.teacher_id
			 WHERE t.classroom_id = ? ORDER BY t.created_at DESC LIMIT 100`
		)
		.bind(id)
		.all<ClassTask>();
	const assignments = await db
		.prepare(
			`SELECT a.id, a.classroom_id, a.teacher_id, u.name AS teacher_name, a.title,
				a.description, a.due_date, a.require_text, a.min_chars,
				a.require_images, a.max_images, a.require_files, a.max_files,
				COALESCE(a.require_audio, 0) AS require_audio, a.created_at
			 FROM classroom_assignments a LEFT JOIN users u ON u.id = a.teacher_id
			 WHERE a.classroom_id = ? ORDER BY a.created_at DESC LIMIT 100`
		)
		.bind(id)
		.all<ClassAssignment>();
	return json({ messages: messagesOut, tasks: tasks.results ?? [], assignments: assignments.results ?? [] });
};

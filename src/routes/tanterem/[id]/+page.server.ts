import { error, type NumericRange } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb, getSessionUser } from '$lib/server/db';
import {
	getMessageRefs,
	isTeacher,
	type ClassAssignment,
	type ClassMessage,
	type Classroom,
	type ClassTask
} from '$lib/server/classroom';

export const load: PageServerLoad = async (event) => {
	const db = getDb(event);
	if (!db) throw error(503 as NumericRange<400, 599>, 'Az adatbázis most nem elérhető.');
	// Nincs ensure*: az olvasást nem blokkoljuk DDL-körökkel.
	const user = await getSessionUser(event, db);
	if (!user) throw error(401 as NumericRange<400, 599>, 'Jelentkezz be!');
	const id = event.params.id;

	const room = await db
		.prepare(
			`SELECT c.id, c.teacher_id, u.name AS teacher_name, c.code, c.name,
				COALESCE(c.subject, '') AS subject, COALESCE(c.description, '') AS description,
				c.created_at, COUNT(m.user_id) AS member_count
			 FROM classrooms c
			 LEFT JOIN users u ON u.id = c.teacher_id
			 LEFT JOIN classroom_members m ON m.classroom_id = c.id
			 WHERE c.id = ? GROUP BY c.id`
		)
		.bind(id)
		.first<Classroom>();
	if (!room) throw error(404 as NumericRange<400, 599>, 'Nincs ilyen osztály.');

	const own = room.teacher_id === user.id;
	const membership = own
		? { classroom_id: id, user_id: user.id }
		: await db
				.prepare(`SELECT classroom_id FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
				.bind(id, user.id)
				.first();
	if (!membership && !isTeacher(user))
		throw error(403 as NumericRange<400, 599>, 'Nem vagy tagja ennek az osztálynak.');

	let members: { id: string; name: string; joined_at: number }[] = [];
	let msgRows: ClassMessage[] = [];
	let taskRows: ClassTask[] = [];
	let assignmentRows: ClassAssignment[] = [];
	// D1-optimalizálás: a 4 független lista 1 batchelt körben fut (eddig 4 kör volt).
	{
		const [membersRes, messagesRes, tasksRes, assignmentsRes] = await db.batch([
			db
				.prepare(
					`SELECT u.id, u.name, m.joined_at FROM classroom_members m
					 JOIN users u ON u.id = m.user_id
					 WHERE m.classroom_id = ? ORDER BY m.joined_at DESC LIMIT 200`
				)
				.bind(id),
			db
				.prepare(
					`SELECT m.id, m.classroom_id, m.teacher_id, u.name AS teacher_name, m.title, m.body,
					m.link_url, m.ref_type, m.ref_id,
					COALESCE(m.ref_title, '') AS ref_title, m.created_at
				 FROM messages m LEFT JOIN users u ON u.id = m.teacher_id
				 WHERE m.classroom_id = ? ORDER BY m.created_at DESC LIMIT 100`
				)
				.bind(id),
			db
				.prepare(
					`SELECT t.id, t.classroom_id, t.teacher_id, u.name AS teacher_name, t.title,
					t.lesson_ids_json, t.question_count, t.target_pct, t.shuffle, t.due_date, t.created_at
				 FROM classroom_tasks t LEFT JOIN users u ON u.id = t.teacher_id
				 WHERE t.classroom_id = ? ORDER BY t.created_at DESC LIMIT 100`
				)
				.bind(id),
			db
				.prepare(
					`SELECT a.id, a.classroom_id, a.teacher_id, u.name AS teacher_name, a.title,
					a.description, a.due_date, a.require_text, a.min_chars,
					a.require_images, a.max_images, a.require_files, a.max_files,
					COALESCE(a.require_audio, 0) AS require_audio, a.created_at
				 FROM classroom_assignments a LEFT JOIN users u ON u.id = a.teacher_id
				 WHERE a.classroom_id = ? ORDER BY a.created_at DESC LIMIT 100`
				)
				.bind(id)
		]);
		members =
			(membersRes as unknown as { results: { id: string; name: string; joined_at: number }[] })
				.results ?? [];
		msgRows =
			(messagesRes as unknown as { results: ClassMessage[] }).results ?? [];
		taskRows = (tasksRes as unknown as { results: ClassTask[] }).results ?? [];
		assignmentRows =
			(assignmentsRes as unknown as { results: ClassAssignment[] }).results ?? [];
	}

	const refsByMessage = await getMessageRefs(
		db,
		msgRows.map((m) => m.id)
	);
	const messagesOut = msgRows.map((m) => ({ ...m, refs: refsByMessage.get(m.id) ?? [] }));
	return { room, own, members, messages: messagesOut, tasks: taskRows, assignments: assignmentRows };
};

import { error, redirect, type NumericRange } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb, getSessionUser } from '$lib/server/db';
import type { AssignmentUpload, ClassAssignment } from '$lib/server/classroom';

export interface AssignmentResultRow {
	user_id: string;
	name: string;
	text_body: string;
	submitted: number;
	submitted_at: number | null;
	grade: number | null;
	feedback: string;
	graded_at: number | null;
	image_count: number;
	file_count: number;
	uploads: AssignmentUpload[];
}

export const load: PageServerLoad = async (event) => {
	const db = getDb(event);
	if (!db) throw error(503 as NumericRange<400, 599>, 'Az adatbázis most nem elérhető.');
	const user = await getSessionUser(event, db);
	if (!user) throw error(401 as NumericRange<400, 599>, 'Jelentkezz be!');
	const roomId = event.params.id;
	const aid = event.params.aid;

	const room = await db
		.prepare(`SELECT id, teacher_id, name FROM classrooms WHERE id = ?`)
		.bind(roomId)
		.first<{ id: string; teacher_id: string; name: string }>();
	if (!room) throw error(404 as NumericRange<400, 599>, 'Nincs ilyen osztály.');
	if (room.teacher_id !== user.id) throw redirect(303, `/tanterem/${roomId}`);

	const assignment = await db
		.prepare(`SELECT * FROM classroom_assignments WHERE id = ? AND classroom_id = ?`)
		.bind(aid, roomId)
		.first<ClassAssignment>();
	if (!assignment) throw error(404 as NumericRange<400, 599>, 'Nincs ilyen beadandó.');

	const members = await db
		.prepare(
			`SELECT u.id AS user_id, u.name AS name,
				s.text_body, s.submitted, s.submitted_at,
				s.grade, s.feedback, s.graded_at
			 FROM classroom_members m
			 JOIN users u ON u.id = m.user_id
			 LEFT JOIN assignment_submissions s ON s.assignment_id = ? AND s.user_id = u.id
			 WHERE m.classroom_id = ? ORDER BY u.name LIMIT 500`
		)
		.bind(aid, roomId)
		.all<{
			user_id: string;
			name: string;
			text_body: string | null;
			submitted: number | null;
			submitted_at: number | null;
			grade: number | null;
			feedback: string | null;
			graded_at: number | null;
		}>();

	const rows = members.results ?? [];
	const out: AssignmentResultRow[] = [];
	for (const r of rows) {
		const ups = await db
			.prepare(
				`SELECT id, assignment_id, classroom_id, user_id, kind, r2_key, file_name, mime, size, width, height, created_at
				 FROM assignment_uploads WHERE assignment_id = ? AND user_id = ? ORDER BY created_at`
			)
			.bind(aid, r.user_id)
			.all<AssignmentUpload>();
		const uploads = (ups.results ?? []).map((u) => ({ ...u, r2_key: '' }));
		out.push({
			user_id: r.user_id,
			name: r.name,
			text_body: r.text_body ?? '',
			submitted: r.submitted ?? 0,
			submitted_at: r.submitted_at ?? null,
			grade: r.grade ?? null,
			feedback: r.feedback ?? '',
			graded_at: r.graded_at ?? null,
			image_count: uploads.filter((u) => u.kind === 'image').length,
			file_count: uploads.filter((u) => u.kind === 'file').length,
			uploads
		});
	}

	return {
		room: { id: room.id, name: room.name },
		assignment,
		results: out
	};
};

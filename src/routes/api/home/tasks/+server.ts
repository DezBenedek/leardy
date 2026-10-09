import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';

/* Kezdőlap: a felhasználó határidős feladatai időrendi sorrendben.
   Kvízfeladatok és beadandók, csatlakozott osztályokból. A saját osztályokban külön az értékelendő beadandókat adjuk vissza.
   Beadott (submitted) tételek már nem jelennek meg.
   A drawerhez a leckék, a cél, a leírás, a követelmények és a tanár-jelölés is jár. */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	// Nincs ensure: a sémát a migrációk biztosítják. Eddig minden lehívás
	// ~15 DDL-lekérdezéssel indult 1 olvasáshoz.
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Nincs bejelentkezve.' }, { status: 401 });

	try {
		const rows = await db
			.prepare(
				`SELECT kind, id, classroom_id, title, due_date, room_name, teacher_id,
					lesson_ids_json, question_count, target_pct,
					description, require_text, require_images, require_files, require_audio
				 FROM (
					SELECT 'quiz' AS kind, t.id, t.classroom_id, t.title, t.due_date,
						c.name AS room_name, c.teacher_id,
						t.lesson_ids_json, t.question_count, t.target_pct,
						NULL AS description, NULL AS require_text, NULL AS require_images,
						NULL AS require_files, NULL AS require_audio
					FROM classroom_tasks t
					JOIN classrooms c ON c.id = t.classroom_id
					LEFT JOIN task_submissions s ON s.task_id = t.id AND s.user_id = ?
					WHERE t.due_date IS NOT NULL
					  AND COALESCE(s.submitted, 0) = 0
					  AND c.teacher_id <> ?
					  AND (EXISTS (SELECT 1 FROM classroom_members m
					                  WHERE m.classroom_id = c.id AND m.user_id = ?))
					UNION ALL
					SELECT 'assignment' AS kind, a.id, a.classroom_id, a.title, a.due_date,
						c.name AS room_name, c.teacher_id,
						NULL AS lesson_ids_json, NULL AS question_count, NULL AS target_pct,
						a.description, a.require_text, a.require_images,
						a.require_files, a.require_audio
					FROM classroom_assignments a
					JOIN classrooms c ON c.id = a.classroom_id
					LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.user_id = ?
					WHERE a.due_date IS NOT NULL
					  AND COALESCE(s.submitted, 0) = 0
					  AND c.teacher_id <> ?
					  AND (EXISTS (SELECT 1 FROM classroom_members m
					                  WHERE m.classroom_id = c.id AND m.user_id = ?))
				 )
				 ORDER BY due_date ASC
				 LIMIT 20`
			)
			.bind(user.id, user.id, user.id, user.id, user.id, user.id)
			.all<{
				kind: string;
				id: string;
				classroom_id: string;
				title: string;
				due_date: number;
				room_name: string;
				teacher_id: string;
				lesson_ids_json: string | null;
				question_count: number | null;
				target_pct: number | null;
				description: string | null;
				require_text: number | null;
				require_images: number | null;
				require_files: number | null;
				require_audio: number | null;
			}>();
		const tasks = (rows.results ?? []).map((r) => ({
			kind: r.kind === 'assignment' ? ('assignment' as const) : ('quiz' as const),
			id: r.id,
			classroomId: r.classroom_id,
			title: r.title,
			dueDate: r.due_date,
			roomName: r.room_name,
			own: r.teacher_id === user.id,
			lessons: parseLessons(r.lesson_ids_json),
			questionCount: r.question_count ?? 0,
			targetPct: r.target_pct ?? 80,
			description: r.description ?? '',
			require_text: r.require_text ?? 1,
			require_images: r.require_images ?? 0,
			require_files: r.require_files ?? 0,
			require_audio: r.require_audio ?? 0
		}));
		const gradingRows = await db.prepare(`
			SELECT a.id, a.classroom_id, a.title, a.due_date, c.name AS room_name,
				a.description, a.require_text, a.require_images, a.require_files, a.require_audio,
				COUNT(*) AS pending_count
			FROM classroom_assignments a
			JOIN classrooms c ON c.id = a.classroom_id
			JOIN assignment_submissions s ON s.assignment_id = a.id
			JOIN classroom_members m ON m.classroom_id = c.id AND m.user_id = s.user_id
			WHERE c.teacher_id = ? AND s.submitted = 1 AND s.graded_at IS NULL
			GROUP BY a.id
			ORDER BY MIN(s.submitted_at) ASC
			LIMIT 20
		`).bind(user.id).all<{
			id: string; classroom_id: string; title: string; due_date: number | null;
			room_name: string; description: string; require_text: number; require_images: number;
			require_files: number; require_audio: number; pending_count: number;
		}>();
		const grading = (gradingRows.results ?? []).map((r) => ({
			kind: 'assignment' as const, id: r.id, classroomId: r.classroom_id,
			title: r.title, dueDate: r.due_date, roomName: r.room_name, own: true,
			description: r.description, require_text: r.require_text, require_images: r.require_images,
			require_files: r.require_files, require_audio: r.require_audio, pendingCount: r.pending_count
		}));

		return json(
			{ tasks, grading },
			{ status: 200, headers: { 'cache-control': 'private, no-store' } }
		);
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült betölteni a feladatokat.' },
			{ status: 500 }
		);
	}
};

function parseLessons(raw: string | null): { id: string; title: string }[] {
	if (!raw) return [];
	try {
		const arr = JSON.parse(raw) as unknown;
		if (!Array.isArray(arr)) return [];
		return arr
			.map((l) => {
				if (typeof l === 'string') return { id: l, title: 'Lecke' };
				const o = l as { id?: unknown; title?: unknown };
				return { id: String(o.id ?? ''), title: String(o.title ?? 'Lecke') };
			})
			.filter((l) => l.id);
	} catch {
		return [];
	}
}

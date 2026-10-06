import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassContentSchema } from '$lib/server/classroom';
import { fireNotify, notifyUser } from '$lib/server/push';

/* Beadandó értékelése: csak a saját tanár. Body: { userId, grade?, feedback? }.
 * grade: 1-5 érdemjegy vagy null (értékelés törlése). feedback: max 2000 karakter. */
export const PATCH: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroomId = event.params.id ?? '';
	const aid = event.params.aid ?? '';

	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(classroomId)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (room.teacher_id !== user.id)
		return json({ error: 'Csak az osztály tanára értékelhet.' }, { status: 403 });

	const assignment = await db
		.prepare(`SELECT id, title FROM classroom_assignments WHERE id = ? AND classroom_id = ?`)
		.bind(aid, classroomId)
		.first<{ id: string; title: string }>();
	if (!assignment) return json({ error: 'Nincs ilyen beadandó.' }, { status: 404 });

	let body: { userId?: unknown; grade?: unknown; feedback?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const targetId = String(body.userId ?? '').trim();
	if (!targetId) return json({ error: 'Hiányzó tanuló.' }, { status: 400 });
	const member = await db
		.prepare(`SELECT user_id FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
		.bind(classroomId, targetId)
		.first<{ user_id: string }>();
	if (!member) return json({ error: 'Nem az osztály tagja.' }, { status: 404 });

	let grade: number | null = null;
	if (body.grade !== null && body.grade !== undefined && String(body.grade) !== '') {
		const g = Math.round(Number(body.grade));
		if (!Number.isInteger(g) || g < 1 || g > 5)
			return json({ error: 'A jegy 1 és 5 között legyen.' }, { status: 400 });
		grade = g;
	}
	const feedback = String(body.feedback ?? '').trim().slice(0, 2000);
	const now = Date.now();

	await db
		.prepare(
			`INSERT INTO assignment_submissions
				(assignment_id, user_id, classroom_id, text_body, submitted, submitted_at, updated_at,
				 grade, feedback, graded_at, graded_by)
			 VALUES (?, ?, ?, '', 0, NULL, ?, ?, ?, ?, ?)
			 ON CONFLICT(assignment_id, user_id) DO UPDATE SET
				grade = excluded.grade,
				feedback = excluded.feedback,
				graded_at = excluded.graded_at,
				graded_by = excluded.graded_by,
				updated_at = excluded.updated_at`
		)
		.bind(aid, targetId, classroomId, now, grade, feedback, grade === null && feedback === '' ? null : now, grade === null && feedback === '' ? null : user.id)
		.run();

	if (grade !== null || feedback !== '') {
		const target = await db
			.prepare(`SELECT id FROM users WHERE id = ?`)
			.bind(targetId)
			.first<{ id: string }>();
		if (target) {
			// Tuzelj es felejtsd: a push hiba vagy lassulas nem foghatja meg a valaszt.
			fireNotify(event, notifyUser(db, {
				userId: targetId,
				title: grade !== null ? `Jegy: ${grade} (${assignment.title || 'Beadandó'})` : `Visszajelzés (${assignment.title || 'Beadandó'})`,
				body: feedback !== '' ? feedback.slice(0, 120) : 'A tanárod értékelte a beadandódat.',
				url: `/tanterem/${classroomId}`,
				tag: `grade:${aid}:${targetId}`,
				classroomId
			}));
		}
	}
	return json({ ok: true, grade, feedback });
};

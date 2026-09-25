import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireAdmin } from '$lib/server/db';

// GET /api/admin/users/[id] — egy fiók részletei: miből mennyije van (superadmin).
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const admin = await requireAdmin(event, db);
	if (!admin) return json({ error: 'Nincs jogosultságod.' }, { status: 403 });
	const id = event.params.id ?? '';
	const u = await db
		.prepare(
			`SELECT u.id, u.name, u.email,
				COALESCE(u.role, 'student') AS role, COALESCE(u.is_admin, 0) AS is_admin,
				COALESCE(u.xp, 0) AS xp, COALESCE(u.streak, 0) AS streak, u.created_at,
				(SELECT COUNT(*) FROM topics t WHERE t.author_id = u.id) AS topics,
				(SELECT COUNT(*) FROM classrooms c WHERE c.teacher_id = u.id) AS classrooms,
				(SELECT COUNT(*) FROM assessments s WHERE s.teacher_id = u.id) AS assessments,
				(SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id) AS enrollments,
				(SELECT COUNT(*) FROM classroom_members m WHERE m.user_id = u.id) AS member_classes,
				(SELECT COUNT(*) FROM messages m WHERE m.teacher_id = u.id) AS messages,
				(SELECT COUNT(*) FROM submissions s WHERE s.student_id = u.id AND s.submitted_at > 0) AS submissions
			 FROM users u WHERE u.id = ?`
		)
		.bind(id)
		.first();
	if (!u) return json({ error: 'Nincs ilyen fiók.' }, { status: 404 });
	return json({ user: u });
};

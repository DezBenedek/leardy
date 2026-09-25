import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireAdmin } from '$lib/server/db';

// GET /api/admin/users?q= — fióklista kereséssel + tartalom-számlálókkal (superadmin).
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const admin = await requireAdmin(event, db);
	if (!admin) return json({ error: 'Nincs jogosultságod.' }, { status: 403 });
	const search = (event.url.searchParams.get('q') ?? '').trim().toLowerCase();
	const like = `%${search}%`;
	const rows = await db
		.prepare(
			`SELECT u.id, u.name, u.email,
				COALESCE(u.role, 'student') AS role, COALESCE(u.is_admin, 0) AS is_admin,
				COALESCE(u.xp, 0) AS xp, COALESCE(u.streak, 0) AS streak, u.created_at,
				(SELECT COUNT(*) FROM topics t WHERE t.author_id = u.id) AS topics,
				(SELECT COUNT(*) FROM classrooms c WHERE c.teacher_id = u.id) AS classrooms,
				(SELECT COUNT(*) FROM assessments s WHERE s.teacher_id = u.id) AS assessments
			 FROM users u
			 WHERE ? = '%%' OR lower(u.name) LIKE ? OR lower(u.email) LIKE ?
			 ORDER BY u.created_at DESC LIMIT 50`
		)
		.bind(like, like, like)
		.all();
	return json({ users: rows.results ?? [] });
};

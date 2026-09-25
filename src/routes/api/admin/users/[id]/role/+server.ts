import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireAdmin } from '$lib/server/db';

// POST /api/admin/users/[id]/role { role } — diák/tanár átállítás (superadmin).
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const admin = await requireAdmin(event, db);
	if (!admin) return json({ error: 'Nincs jogosultságod.' }, { status: 403 });
	const id = event.params.id ?? '';
	const target = await db
		.prepare(`SELECT id, COALESCE(is_admin, 0) AS is_admin FROM users WHERE id = ?`)
		.bind(id)
		.first<{ id: string; is_admin: number }>();
	if (!target) return json({ error: 'Nincs ilyen fiók.' }, { status: 404 });
	if (target.is_admin === 1 && target.id !== admin.id) {
		return json({ error: 'Másik admin szerepét nem állíthatod át.' }, { status: 403 });
	}
	let body: { role?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const role = String(body.role ?? '');
	if (role !== 'student' && role !== 'teacher') {
		return json({ error: 'Hibás szerep.' }, { status: 400 });
	}
	await db.prepare(`UPDATE users SET role = ? WHERE id = ?`).bind(role, id).run();
	return json({ ok: true, role });
};

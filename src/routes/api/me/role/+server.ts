import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';

// POST /api/me/role { role: 'student'|'teacher' } — szerepváltás (demo, saját fiók).
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
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
	await db.prepare(`UPDATE users SET role = ? WHERE id = ?`).bind(role, user.id).run();
	return json({ ok: true, role });
};

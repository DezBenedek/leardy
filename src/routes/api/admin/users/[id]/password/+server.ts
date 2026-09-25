import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, hashPasswordScrypt, makeTempPassword, requireAdmin } from '$lib/server/db';

// POST /api/admin/users/[id]/password { password? } — ideiglenes jelszó kiadása.
// Ha nincs megadva, generálunk egyet; a visszaadott értéket egyszer mutatjuk.
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
		return json({ error: 'Másik admin jelszavát nem állíthatod át.' }, { status: 403 });
	}
	let body: { password?: unknown };
	try {
		body = await event.request.json();
	} catch {
		body = {};
	}
	let temp = String(body.password ?? '').trim();
	if (!temp) temp = makeTempPassword();
	else if (temp.length < 8) return json({ error: 'A jelszó legalább 8 karakter legyen.' }, { status: 400 });
	const pass_hash = await hashPasswordScrypt(temp);
	await db
		.prepare(`UPDATE users SET pass_hash = ?, salt = '' WHERE id = ?`)
		.bind(pass_hash, id)
		.run();
	// Biztonság: az összes élő session kidobása — legközelebb az új jelszó kell.
	await db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(id).run();
	return json({ ok: true, temp_password: temp });
};

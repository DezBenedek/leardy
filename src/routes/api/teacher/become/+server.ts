import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, publicUser, requireUser, type DbUser } from '$lib/server/db';

/* Tanárrá válás: önkiszolgáló, egy kattintás. Később ide köthető jóváhagyás. */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	if (user.role === 'teacher') return json({ user });

	await db.prepare(`UPDATE users SET role = 'teacher' WHERE id = ?`).bind(user.id).run();
	const updated = await db
		.prepare(
			`SELECT id, name, email,
				COALESCE(role, 'student') AS role, COALESCE(xp, 0) AS xp, COALESCE(streak, 0) AS streak,
				COALESCE(is_admin, 0) AS is_admin
			 FROM users WHERE id = ?`
		)
		.bind(user.id)
		.first<DbUser>();
	if (!updated) return json({ error: 'Hiba történt. Próbáld újra!' }, { status: 500 });
	return json({ user: publicUser(updated) });
};

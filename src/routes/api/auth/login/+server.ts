import { json, type RequestHandler } from '@sveltejs/kit';
import { createSession, ensureAuthSchema, getDb, hashPassword, publicUser, type DbUser } from '$lib/server/db';

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);

	let body: { email?: unknown; password?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}

	const email = String(body.email ?? '').trim().toLowerCase();
	const password = String(body.password ?? '');
	if (!email || !password)
		return json({ error: 'Add meg az e-mail címed és a jelszavad.' }, { status: 400 });

	const found = await db
		.prepare(
			`SELECT id, name, email, pass_hash, salt,
				COALESCE(role, 'student') AS role, COALESCE(xp, 0) AS xp, COALESCE(streak, 0) AS streak
			 FROM users WHERE email = ?`
		)
		.bind(email)
		.first<DbUser>();
	if (!found) return json({ error: 'Nincs fiók ezzel az e-mail címmel.' }, { status: 401 });

	const hash = await hashPassword(password, found.salt);
	if (hash !== found.pass_hash)
		return json({ error: 'Hibás jelszó. Próbáld újra!' }, { status: 401 });

	await createSession(event, db, found.id);
	return json({ user: publicUser(found) });
};

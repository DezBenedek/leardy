import { json, type RequestHandler } from '@sveltejs/kit';
import { createSession, ensureAuthSchema, getDb, publicUser, verifyPassword, type DbUser } from '$lib/server/db';

// Egységes hibaüzenet mindkét esetre (nincs fiók / hibás jelszó / régi hash):
// nem áruljuk el, létezik-e az e-mail cím.
const BAD_LOGIN = 'Hibás e-mail cím vagy jelszó.';

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
				COALESCE(role, 'student') AS role, COALESCE(xp, 0) AS xp, COALESCE(streak, 0) AS streak,
				COALESCE(is_admin, 0) AS is_admin
			 FROM users WHERE email = ?`
		)
		.bind(email)
		.first<DbUser>();
	if (!found) return json({ error: BAD_LOGIN }, { status: 401 });

	const ok = await verifyPassword(password, found.pass_hash);
	if (!ok) return json({ error: BAD_LOGIN }, { status: 401 });

	await createSession(event, db, found.id);
	return json({ user: publicUser(found) });
};

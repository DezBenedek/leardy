import { json, type RequestHandler } from '@sveltejs/kit';
import {
	ensureAuthSchema,
	getDb,
	hashPasswordScrypt,
	requireUser,
	SESSION_COOKIE,
	verifyPassword,
	type DbUser
} from '$lib/server/db';

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);

	const sessionUser = await requireUser(event, db);
	if (!sessionUser) return json({ error: 'Nincs bejelentkezve.' }, { status: 401 });

	let body: { currentPassword?: unknown; newPassword?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}

	const currentPassword = String(body.currentPassword ?? '');
	const newPassword = String(body.newPassword ?? '');

	if (!currentPassword) return json({ error: 'Add meg a jelenlegi jelszavad.' }, { status: 400 });
	if (newPassword.length < 8)
		return json({ error: 'Az új jelszó legalább 8 karakter legyen.' }, { status: 400 });
	if (newPassword.length > 200)
		return json({ error: 'Az új jelszó túl hosszú.' }, { status: 400 });
	if (currentPassword === newPassword)
		return json({ error: 'Az új jelszó térjen el a régitől.' }, { status: 400 });

	const found = await db
		.prepare('SELECT id, pass_hash FROM users WHERE id = ?')
		.bind(sessionUser.id)
		.first<DbUser>();
	if (!found) return json({ error: 'Nincs bejelentkezve.' }, { status: 401 });

	const ok = await verifyPassword(currentPassword, found.pass_hash);
	if (!ok) return json({ error: 'A jelenlegi jelszó nem helyes.' }, { status: 401 });

	const pass_hash = await hashPasswordScrypt(newPassword);
	await db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').bind(pass_hash, found.id).run();

	// Minden más eszközt kiléptetünk, a mostanit megtartjuk.
	const currentToken = event.cookies.get(SESSION_COOKIE);
	if (currentToken) {
		await db
			.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?')
			.bind(found.id, currentToken)
			.run();
	} else {
		await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(found.id).run();
	}

	return json({ ok: true });
};

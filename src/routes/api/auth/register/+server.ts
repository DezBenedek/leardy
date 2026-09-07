import { json, type RequestHandler } from '@sveltejs/kit';
import { createSession, getDb, hashPassword, makeSalt, publicUser } from '$lib/server/db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });

	let body: { name?: unknown; email?: unknown; password?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}

	const name = String(body.name ?? '').trim();
	const email = String(body.email ?? '').trim().toLowerCase();
	const password = String(body.password ?? '');

	if (name.length < 2) return json({ error: 'Add meg a neved.' }, { status: 400 });
	if (!EMAIL_RE.test(email)) return json({ error: 'Ez nem valós e-mail cím.' }, { status: 400 });
	if (password.length < 8)
		return json({ error: 'A jelszó legalább 8 karakter legyen.' }, { status: 400 });

	const exists = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
	if (exists)
		return json({ error: 'Ezzel az e-mail címmel már regisztráltak.' }, { status: 409 });

	const id = crypto.randomUUID();
	const salt = makeSalt();
	const pass_hash = await hashPassword(password, salt);
	await db
		.prepare(
			'INSERT INTO users (id, name, email, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.bind(id, name, email, pass_hash, salt, Date.now())
		.run();
	await createSession(event, db, id);

	return json({ user: { id, name, email } }, { status: 201 });
};

import { json, type RequestHandler } from '@sveltejs/kit';
import {
	getDb,
	ensureAuthSchema,
	getSessionUser,
	requireUser,
	publicUser,
	SESSION_COOKIE,
	type DbUser
} from '$lib/server/db';

export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await getSessionUser(event, db);
	if (!user) return json({ error: 'Nincs bejelentkezve.' }, { status: 401 });
	return json({ user });
};

export const PATCH: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const sessionUser = await requireUser(event, db);
	if (!sessionUser) return json({ error: 'Nincs bejelentkezve.' }, { status: 401 });

	let body: { name?: unknown; email?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}

	// E-mail a Google fiókból jön, nem módosítható.
	if (body.email !== undefined)
		return json(
			{ error: 'Az e-mail cím a Google fiókodból jön, nem módosítható.' },
			{ status: 403 }
		);

	const hasName = body.name !== undefined;
	if (!hasName) return json({ error: 'Hibás kérés.' }, { status: 400 });

	const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
	if (name.length < 2) return json({ error: 'Add meg a neved.' }, { status: 400 });
	if (name.length > 80) return json({ error: 'A név legfeljebb 80 karakter lehet.' }, { status: 400 });
	await db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, sessionUser.id).run();

	const updated = await db
		.prepare(
			`SELECT id, name, email,
				COALESCE(school_id, '') AS school_id,
				COALESCE(role, 'student') AS role, COALESCE(xp, 0) AS xp, COALESCE(streak, 0) AS streak,
				COALESCE(is_admin, 0) AS is_admin
			 FROM users WHERE id = ?`
		)
		.bind(sessionUser.id)
		.first<DbUser>();
	if (!updated) return json({ error: 'Hiba történt. Próbáld újra!' }, { status: 500 });

	return json({ user: publicUser(updated) });
};

/* Fiók törlése: minden saját adat törlődik (haladás, kártyák, beküldések,
 * tagságok, feltöltések). Ha van tagokkal teli saját osztály, előbb azt kell
 * törölni vagy átadni: 409-et adunk a tennivalóval. */
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const sessionUser = await requireUser(event, db);
	if (!sessionUser) return json({ error: 'Nincs bejelentkezve.' }, { status: 401 });

	const owned = await db
		.prepare(
			`SELECT c.id, c.name, COUNT(m.user_id) AS members
			 FROM classrooms c LEFT JOIN classroom_members m ON m.classroom_id = c.id
			 WHERE c.teacher_id = ? GROUP BY c.id`
		)
		.bind(sessionUser.id)
		.all<{ id: string; name: string; members: number }>()
		.catch(() => ({ results: [] as { id: string; name: string; members: number }[] }));
	const ownedRows = owned.results ?? [];
	const blocking = ownedRows.filter((c) => (c.members ?? 0) > 0);
	if (blocking.length > 0)
		return json(
			{ error: `Előbb töröld a saját osztályaid (${blocking.map((c) => c.name).join(', ')}), mert tagnak nem törölheted a fiókod.` },
			{ status: 409 }
		);

	// R2 feltöltések best-effort törlése a DB-sorok előtt.
	try {
		const uploads = await db
			.prepare(`SELECT r2_key FROM assignment_uploads WHERE user_id = ? LIMIT 500`)
			.bind(sessionUser.id)
			.all<{ r2_key: string }>();
		const bucket = (event.platform?.env as { UPLOADS?: { delete: (k: string) => Promise<void> } } | undefined)?.UPLOADS;
		if (bucket) {
			await Promise.allSettled(
				((uploads.results ?? []).map((u) => u.r2_key).filter(Boolean)).map((k) => bucket.delete(k))
			);
		}
	} catch {
		// nem blokkolhat
	}

	const userTables = [
		'sessions',
		'password_reset_tokens',
		'push_subscriptions',
		'task_submissions',
		'assignment_submissions',
		'assignment_uploads',
		'classroom_members',
		'lesson_progress',
		'card_progress',
		'library',
		'exam_attempts'
	];
	for (const t of userTables) {
		try {
			await db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(sessionUser.id).run();
		} catch {
			// régi DB-n a tábla hiányozhat
		}
	}
	// Saját paklik kártyástul (deck_cards a paklihoz van kötve).
	try {
		const decks = await db
			.prepare(`SELECT id FROM decks WHERE user_id = ?`)
			.bind(sessionUser.id)
			.all<{ id: string }>();
		const ids = (decks.results ?? []).map((d) => d.id);
		if (ids.length > 0) {
			const ph = ids.map(() => '?').join(',');
			await db.prepare(`DELETE FROM deck_cards WHERE deck_id IN (${ph})`).bind(...ids).run();
		}
		await db.prepare(`DELETE FROM decks WHERE user_id = ?`).bind(sessionUser.id).run();
	} catch {
		// nem kritikus
	}
	// Üres saját osztályok törlése, végül a felhasználó.
	try {
		for (const c of ownedRows) {
			await db.prepare(`DELETE FROM classrooms WHERE id = ?`).bind(c.id).run();
		}
	} catch {
		// nem kritikus
	}
	await db.prepare(`DELETE FROM users WHERE id = ?`).bind(sessionUser.id).run();
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
	return json({ ok: true });
};

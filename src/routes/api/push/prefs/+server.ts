import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureSecuritySchema } from '$lib/server/classroom';

function clampMuted(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	const ids = v
		.filter((x): x is string => typeof x === 'string')
		.map((x) => x.trim())
		.filter((x) => x.length > 0 && x.length <= 80);
	return [...new Set(ids)].slice(0, 200);
}

/* Helyi értesítés-kapcsolók feltöltése, hogy a zárt app push is tartsa őket.
 * Body: { messages?: boolean, tasks?: boolean, grades?: boolean, muted?: string[] }. */
export const PUT: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureSecuritySchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let body: { messages?: unknown; tasks?: unknown; grades?: unknown; muted?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const messages = body.messages === false ? 0 : 1;
	const tasks = body.tasks === false ? 0 : 1;
	const grades = body.grades === false ? 0 : 1;
	const muted = JSON.stringify(clampMuted(body.muted));
	await db
		.prepare(
			`INSERT INTO notification_prefs (user_id, messages, tasks, grades, muted_json, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(user_id) DO UPDATE SET
				messages = excluded.messages,
				tasks = excluded.tasks,
				grades = excluded.grades,
				muted_json = excluded.muted_json,
				updated_at = excluded.updated_at`
		)
		.bind(user.id, messages, tasks, grades, muted, Date.now())
		.run();
	return json({ ok: true });
};

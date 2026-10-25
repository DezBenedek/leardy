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
	let body: { messages?: unknown; tasks?: unknown; grades?: unknown; muted?: unknown; reminder?: unknown; reminderTime?: unknown; timeZone?: unknown; dueSoon?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const messages = body.messages === false ? 0 : 1;
	const tasks = body.tasks === false ? 0 : 1;
	const grades = body.grades === false ? 0 : 1;
	const muted = JSON.stringify(clampMuted(body.muted));
	const reminderTime = typeof body.reminderTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.reminderTime) ? body.reminderTime : '20:00';
	let timeZone = 'Europe/Budapest';
	try {
		if (typeof body.timeZone === 'string' && body.timeZone.length <= 100) {
			new Intl.DateTimeFormat('hu-HU', { timeZone: body.timeZone }).format();
			timeZone = body.timeZone;
		}
	} catch { /* Ismeretlen időzónánál a budapesti időt használjuk. */ }
	await db
		.prepare(
			`INSERT INTO notification_prefs (user_id, messages, tasks, grades, muted_json, updated_at, reminder, reminder_time, time_zone, due_soon)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(user_id) DO UPDATE SET
				messages = excluded.messages,
				tasks = excluded.tasks,
				grades = excluded.grades,
				muted_json = excluded.muted_json,
				reminder = excluded.reminder,
				reminder_time = excluded.reminder_time,
				time_zone = excluded.time_zone,
				due_soon = excluded.due_soon,
				updated_at = excluded.updated_at`
		)
		.bind(user.id, messages, tasks, grades, muted, Date.now(), body.reminder === false ? 0 : 1, reminderTime, timeZone, body.dueSoon === false ? 0 : 1)
		.run();
	return json({ ok: true });
};

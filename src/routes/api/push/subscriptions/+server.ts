import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { deletePushSubscription, ensureVapidKeys, savePushSubscription } from '$lib/server/push';
import { ensureSecuritySchema } from '$lib/server/classroom';

function validSubscription(b: { endpoint?: unknown; p256dh?: unknown; auth?: unknown }): boolean {
	const endpoint = String(b.endpoint ?? '');
	const p256dh = String(b.p256dh ?? '');
	const auth = String(b.auth ?? '');
	try {
		const u = new URL(endpoint);
		if (u.protocol !== 'https:') return false;
	} catch {
		return false;
	}
	return p256dh.length >= 80 && p256dh.length <= 120 && auth.length >= 16 && auth.length <= 40;
}

/* Ez az eszkoz feliratkoztatása push-ra. Body: { endpoint, p256dh, auth }. */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureSecuritySchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let body: { endpoint?: unknown; p256dh?: unknown; auth?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	if (!validSubscription(body)) return json({ error: 'Hibás feliratkozás.' }, { status: 400 });
	await ensureVapidKeys(db);
	await savePushSubscription(db, user.id, {
		endpoint: String(body.endpoint),
		p256dh: String(body.p256dh),
		auth: String(body.auth)
	});
	return json({ ok: true });
};

/* Leiratkozas errol az eszkozrol. Body: { endpoint }. */
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureSecuritySchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let body: { endpoint?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const endpoint = String(body.endpoint ?? '');
	if (!endpoint) return json({ error: 'Hiányzó endpoint.' }, { status: 400 });
	await deletePushSubscription(db, user.id, endpoint);
	return json({ ok: true });
};

import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureSecuritySchema } from '$lib/server/classroom';
import { sendPushToSubscription, type PushSubscription } from '$lib/server/push';

/* Teszt push a saját eszközeidre. Így ellenőrizhető, hogy a zárt appos
 * értesítés megérkezik-e: a teszt után tedd háttérbe vagy zárd be az appot.
 * Válasz: { ok, sent, total }. */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureSecuritySchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const rows = await db
		.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ? LIMIT 20`)
		.bind(user.id)
		.all<PushSubscription>();
	const subs = rows.results ?? [];
	if (subs.length === 0)
		return json({ error: 'Ezen az eszközön nincs bekapcsolva a push.' }, { status: 404 });
	const results = await Promise.allSettled(
		subs.map((s) =>
			sendPushToSubscription(db, s, {
				title: 'Teszt értesítés',
				body: 'Ha ezt látod, a push működik zárt appnál is.',
				url: '/beallitasok',
				tag: `test:${Date.now()}`
			})
		)
	);
	const sent = results.filter((r) => r.status === 'fulfilled' && r.value).length;
	if (sent === 0)
		return json({ error: 'A push küldése nem sikerült. Nézd meg a szerver naplót.' }, { status: 502 });
	return json({ ok: true, sent, total: subs.length });
};

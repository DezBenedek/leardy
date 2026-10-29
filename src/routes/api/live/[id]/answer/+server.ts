import { json, type RequestHandler } from '@sveltejs/kit';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { getDb, requireUser } from '$lib/server/db';
import { ensureLiveSchema, getClassRole, callLiveRoom } from '$lib/server/live';

/* Válasz beküldése: a helyesség számítást a DO végzi. Válasz {ok}. */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureLiveSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if (!id) return json({ error: 'Hibás kérés.' }, { status: 400 });

	const session = await db
		.prepare(`SELECT id, classroom_id, status FROM live_sessions WHERE id = ?`)
		.bind(id)
		.first<{ id: string; classroom_id: string; status: string }>();
	if (!session) return json({ error: 'Nincs ilyen dolgozat.' }, { status: 404 });
	const role = await getClassRole(db, session.classroom_id, user.id);
	if (!role.isMember) return json({ error: 'Nem vagy az osztály tagja.' }, { status: 403 });

	let body: { questionIdx?: unknown; answer?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const questionIdx = Math.floor(Number(body.questionIdx));
	if (!Number.isInteger(questionIdx) || questionIdx < 0) {
		return json({ error: 'Hibás kérdésindex.' }, { status: 400 });
	}
	const answer = String(body.answer ?? '');

	const ns = (event.platform?.env as unknown as { LIVE?: DurableObjectNamespace } | undefined)?.LIVE;
	if (!ns) return json({ error: 'Az élő modul nem elérhető.' }, { status: 503 });
	try {
		const { status, data } = await callLiveRoom(ns, id, {
			type: 'answer',
			userId: user.id,
			questionIdx,
			answer
		});
		if (status < 200 || status >= 300) {
			const msg = typeof data['error'] === 'string' && data['error'] ? data['error'] : 'A válasz mentése most nem sikerült.';
			return json({ error: msg }, { status: status === 403 ? 403 : 502 });
		}
		return json({ ok: data['ok'] === true });
	} catch {
		return json({ error: 'A válasz mentése most nem sikerült.' }, { status: 503 });
	}
};

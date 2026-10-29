import { json, type RequestHandler } from '@sveltejs/kit';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { getDb, requireUser } from '$lib/server/db';
import { ensureLiveSchema, getClassRole, callLiveRoom } from '$lib/server/live';

/* Léptetés synced/stage módban: csak tanár. Body: { index? } (üresen eggyel tovább). */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureLiveSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if (!id) return json({ error: 'Hibás kérés.' }, { status: 400 });

	const session = await db
		.prepare(`SELECT id, classroom_id FROM live_sessions WHERE id = ?`)
		.bind(id)
		.first<{ id: string; classroom_id: string }>();
	if (!session) return json({ error: 'Nincs ilyen dolgozat.' }, { status: 404 });
	const role = await getClassRole(db, session.classroom_id, user.id);
	if (!role.exists) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (!role.isTeacher) return json({ error: 'Csak az osztály tanára léptethet.' }, { status: 403 });

	let index: number | undefined;
	try {
		const body = (await event.request.json()) as { index?: unknown };
		if (body.index !== undefined && body.index !== null && String(body.index) !== '') {
			const n = Math.floor(Number(body.index));
			if (!Number.isInteger(n) || n < 0) return json({ error: 'Hibás index.' }, { status: 400 });
			index = n;
		}
	} catch {
		index = undefined;
	}

	const ns = (event.platform?.env as unknown as { LIVE?: DurableObjectNamespace } | undefined)?.LIVE;
	if (!ns) return json({ error: 'Az élő modul nem elérhető.' }, { status: 503 });
	try {
		const { data } = await callLiveRoom(
			ns,
			id,
			index === undefined ? { type: 'next' } : { type: 'next', index }
		);
		return json({ ok: true, currentIndex: (data['currentIndex'] as number | undefined) ?? index ?? null });
	} catch {
		return json({ error: 'A léptetés most nem sikerült.' }, { status: 503 });
	}
};

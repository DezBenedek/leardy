import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { dealItems, getLiveByCode } from '$lib/server/live';

// POST /api/live/[code]/start — indítás (tanár). Kiosztja a kérdéssorokat, indítja az órát.
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const s = await getLiveByCode(db, event.params.code ?? '');
	if (!s) return json({ error: 'Nincs ilyen kódú élő dolgozat.' }, { status: 404 });
	if (s.teacher_id !== user.id && (user.is_admin ?? 0) !== 1) {
		return json({ error: 'Nincs jogosultságod.' }, { status: 403 });
	}
	if (s.status !== 'lobby') return json({ error: 'Ez a menet már elindult.' }, { status: 409 });
	const parts = await db
		.prepare(`SELECT user_id FROM live_participants WHERE session_id = ?`)
		.bind(s.id)
		.all<{ user_id: string }>();
	if ((parts.results ?? []).length === 0) {
		return json({ error: 'Még senki sem csatlakozott.' }, { status: 409 });
	}
	// Próbaosztás az első csatlakozónál: üres kvízre nem indulunk.
	const first = (parts.results ?? [])[0].user_id;
	const n = await dealItems(db, s, first);
	if (n === 0) return json({ error: 'Az alap kvíz üres.' }, { status: 409 });
	for (const p of parts.results ?? []) {
		if (p.user_id !== first) await dealItems(db, s, p.user_id);
	}
	const total = await db
		.prepare(`SELECT COUNT(*) AS n FROM live_items WHERE session_id = ? AND user_id = ?`)
		.bind(s.id, first)
		.first<{ n: number }>();
	const now = Date.now();
	await db
		.prepare(
			`UPDATE live_sessions SET status = 'live', started_at = ?, total_q = ?,
				current_idx = 0, deadline_ts = ?, ends_at = ? WHERE id = ?`
		)
		.bind(
			now,
			total?.n ?? n,
			s.pacing === 'global' ? now + s.per_q_secs * 1000 : 0,
			s.pacing === 'self' ? now + s.total_mins * 60000 : 0,
			s.id
		)
		.run();
	return json({ ok: true });
};

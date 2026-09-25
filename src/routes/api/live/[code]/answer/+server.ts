import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { getLiveByCode, isLiveParticipant, transition } from '$lib/server/live';

// POST /api/live/[code]/answer { idx, answer } — válasz rögzítése (diák, egyszer).
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	let s = await getLiveByCode(db, event.params.code ?? '');
	if (!s) return json({ error: 'Nincs ilyen kódú élő dolgozat.' }, { status: 404 });
	if (!(await isLiveParticipant(db, s.id, user.id))) {
		return json({ error: 'Nem vagy bent ebben a menetben.' }, { status: 403 });
	}
	const fin = await db
		.prepare(`SELECT finished_at FROM live_participants WHERE session_id = ? AND user_id = ?`)
		.bind(s.id, user.id)
		.first<{ finished_at: number }>();
	if ((fin?.finished_at ?? 0) > 0) return json({ error: 'Már befejezted.' }, { status: 409 });
	if (s.status !== 'live') return json({ error: 'A menet még nem indult el.' }, { status: 409 });
	s = await transition(db, s);
	if (s.status !== 'live') return json({ error: 'A menet véget ért.' }, { status: 410 });

	let body: { idx?: unknown; answer?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const idx = Number(body.idx);
	if (!Number.isInteger(idx) || idx < 0) return json({ error: 'Hibás kérdés.' }, { status: 400 });
	const answer = String(body.answer ?? '').trim();

	if (s.pacing === 'global') {
		if (idx !== s.current_idx) return json({ error: 'Már nem ez a kérdés van soron.' }, { status: 409 });
		if (s.deadline_ts > 0 && Date.now() > s.deadline_ts) {
			return json({ error: 'Lejárt az idő.' }, { status: 410 });
		}
	} else {
		if (s.ends_at > 0 && Date.now() > s.ends_at) {
			return json({ error: 'Lejárt az összidő.' }, { status: 410 });
		}
	}
	const item = await db
		.prepare(
			`SELECT id, correct_answer FROM live_items WHERE session_id = ? AND user_id = ? AND idx = ?`
		)
		.bind(s.id, user.id, idx)
		.first<{ id: string; correct_answer: string }>();
	if (!item) return json({ error: 'Nincs ilyen kérdésed.' }, { status: 404 });
	const dup = await db.prepare(`SELECT 1 AS x FROM live_answers WHERE item_id = ?`).bind(item.id).first();
	if (dup) return json({ error: 'Erre már válaszoltál.' }, { status: 409 });
	const correct = answer !== '' && answer === item.correct_answer ? 1 : 0;
	await db
		.prepare(
			`INSERT INTO live_answers (item_id, session_id, user_id, idx, answer, correct, at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(item.id, s.id, user.id, idx, answer, correct, Date.now())
		.run();
	return json({ ok: true });
};

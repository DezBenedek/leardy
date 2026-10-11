import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { saveCardProgress } from '$lib/server/curriculum';

/** Kártya-osztályzatok mentése: { results: [{ key, known }] }. */
export const POST: RequestHandler = async (event) => {
	try {
		const db = getDb(event);
		if (!db) return json({ error: 'Nincs adatbázis.' }, { status: 500 });
		const user = await requireUser(event, db);
		if (!user) return json({ error: 'Bejelentkezés szükséges.' }, { status: 401 });
		const body = await event.request.json().catch(() => ({}));
		const raw: unknown[] = Array.isArray(body.results) ? body.results : [];
		const results = raw
			.filter((r): r is { key: string; known?: unknown } => !!r && typeof r === 'object' && typeof (r as { key?: unknown }).key === 'string' && !!(r as { key: string }).key)
			.slice(0, 500)
			.map((r) => ({ key: r.key, known: r.known === true }));
		await saveCardProgress(db, user.id, results);
		return json({ ok: true });
	} catch (e) {
		return json({ error: 'Nem sikerült menteni.' }, { status: 500 });
	}
};

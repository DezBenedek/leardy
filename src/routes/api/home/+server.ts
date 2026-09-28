import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { getHomeStats, getSuggestions } from '$lib/server/curriculum';

/** Home-statok bejelentkezett usernek. Nincs user → 401 (a kliens üres állapotot mutat). */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Nincs bejelentkezve.' }, { status: 401 });
	try {
		const [stats, suggestions] = await Promise.all([
			getHomeStats(event, user.id),
			getSuggestions(event, user.id)
		]);
		// Élő személyes adat: HTTP-gyorstárba nem kerül.
		return json({ ...stats, suggestions }, { headers: { 'cache-control': 'private, no-store' } });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült betölteni a kezdőlapot.' },
			{ status: 500 }
		);
	}
};

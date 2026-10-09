import type { LayoutServerLoad } from './$types';
import { getDb, getSessionUser } from '$lib/server/db';

/** A session sütiből: az auth-állapot már az első paintkor ismert, splash nélkül.
 *  Szándékosan nincs ensureAuthSchema: az minden navigációt több D1-körrel
 *  blokkolna, a sémát a migrációk + az író API-végpontok biztosítják. */
export const load: LayoutServerLoad = async (event) => {
	if (event.url.pathname === '/offline') return { user: null };
	try {
		const db = getDb(event);
		if (!db) return { user: null };
		const user = await getSessionUser(event, db);
		return { user };
	} catch {
		return { user: null };
	}
};

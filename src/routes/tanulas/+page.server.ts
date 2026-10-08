import { listSubjects } from '$lib/server/curriculum';
import { getDb, getSessionUser } from '$lib/server/db';
import { canEnterEditor } from '$lib/server/curriculum-editor';
import type { PageServerLoad } from './$types';

/** Tantárgy-lista a választóhoz. A fa kliens-fetch-csel jön (/api/browse). */
export const load: PageServerLoad = async (event) => {
	try {
		const subjects = await listSubjects(event);
		const db = getDb(event);
		const user = db ? await getSessionUser(event, db) : null;
		const isEditor = db && user ? await canEnterEditor(db, user) : false;
		return { subjects, isEditor };
	} catch {
		return { subjects: [], isEditor: false };
	}
};

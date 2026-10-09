import { error } from '@sveltejs/kit';
import { getSubjectTree } from '$lib/server/curriculum';
import { getDb, getSessionUser } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const db = getDb(event);
	const userId = db ? (await getSessionUser(event, db))?.id ?? null : null;
	const tree = await getSubjectTree(event, event.params.id, userId);
	if (!tree) throw error(404, 'Nincs ilyen tantárgy.');
	return { tree };
};

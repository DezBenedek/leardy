import { error } from '@sveltejs/kit';
import { getSubjectTree } from '$lib/server/curriculum';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	// D1-optimalizálás: a user a layout-betöltésből jön (parent), nem kérdezzük
	// le a sessiont másodszor ugyanarra a navigációra.
	let userId: string | number | null = null;
	try {
		const parent = await event.parent();
		userId = (parent?.user as { id?: string | number } | null)?.id ?? null;
	} catch {
		// vendégként is megy
	}
	const tree = await getSubjectTree(event, event.params.id, userId);
	if (!tree) throw error(404, 'Nincs ilyen tantárgy.');
	return { tree };
};

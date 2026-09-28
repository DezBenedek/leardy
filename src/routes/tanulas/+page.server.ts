import { listSubjects } from '$lib/server/curriculum';
import type { PageServerLoad } from './$types';

/** Tantárgy-lista a választóhoz. A fa kliens-fetch-csel jön (/api/browse). */
export const load: PageServerLoad = async (event) => {
	try {
		const subjects = await listSubjects(event);
		return { subjects };
	} catch {
		return { subjects: [] };
	}
};

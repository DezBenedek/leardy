import type { PageServerLoad } from './$types';
import { requireDeveloper } from '$lib/server/admin/guards';

export const load: PageServerLoad = async (event) => {
	try {
		await requireDeveloper(event);
		return { forbidden: false };
	} catch {
		return { forbidden: true };
	}
};

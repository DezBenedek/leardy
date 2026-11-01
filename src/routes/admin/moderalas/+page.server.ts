import type { PageServerLoad } from './$types';
import { requireModerator } from '$lib/server/admin/guards';

export const load: PageServerLoad = async (event) => {
	try {
		await requireModerator(event);
		return { forbidden: false };
	} catch {
		return { forbidden: true };
	}
};

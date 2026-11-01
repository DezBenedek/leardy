import type { PageServerLoad } from './$types';
import { requireSchoolStats } from '$lib/server/admin/guards';

export const load: PageServerLoad = async (event) => {
	try {
		const { user } = await requireSchoolStats(event);
		return { forbidden: false, schoolId: user.school_id };
	} catch {
		return { forbidden: true, schoolId: '' };
	}
};

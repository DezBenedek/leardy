import { listSubjects } from '$lib/server/curriculum';
import type { PageServerLoad } from './$types';

/** Csak publikus mini-adat. A user-statok kliens-fetch-csel jönnek (/api/home). */
export const load: PageServerLoad = async (event) => {
	try {
		const subjects = await listSubjects(event);
		return {
			subjectCount: subjects.length,
			lessonCount: subjects.reduce((n, s) => n + s.lessonCount, 0)
		};
	} catch {
		return { subjectCount: 0, lessonCount: 0 };
	}
};

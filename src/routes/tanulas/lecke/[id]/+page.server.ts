import { error } from '@sveltejs/kit';
import { getLessonPage } from '$lib/server/curriculum';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const lessonPage = await getLessonPage(event, event.params.id);
	if (!lessonPage) throw error(404, 'Nincs ilyen lecke.');
	return { lessonPage };
};

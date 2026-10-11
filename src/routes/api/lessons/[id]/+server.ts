import { error, type RequestHandler } from '@sveltejs/kit';
import { getLessonPage } from '$lib/server/curriculum';
import { contentResponse, fingerprint, publicContent } from '$lib/server/content-cache';

export const GET: RequestHandler = async (event) => {
	const resource = await publicContent(event, `lesson:${event.params.id}`, null, async () => {
		const lessonPage = await getLessonPage(event, event.params.id!);
		if (!lessonPage) error(404, 'Nincs ilyen lecke.');
		return { lessonPage, quizVersion: await fingerprint(lessonPage.quizzes) };
	});
	return contentResponse(event, { ...resource.data, contentVersion: resource.version }, resource.version);
};

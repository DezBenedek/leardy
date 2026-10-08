import { redirect } from '@sveltejs/kit';
import { lessonPath } from '$lib/lesson-paths';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) => {
	redirect(308, lessonPath(params.id) + url.search);
};

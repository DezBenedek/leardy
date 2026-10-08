import { redirect } from '@sveltejs/kit';
import { lessonEditorPath } from '$lib/lesson-paths';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) => {
	redirect(308, lessonEditorPath(params.id) + url.search);
};

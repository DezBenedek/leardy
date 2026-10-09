import { error } from '@sveltejs/kit';
import type { LessonDocument } from '$lib/content-protocol';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
 const response = await event.fetch(`/api/lessons/${encodeURIComponent(event.params.id)}`);
 if (!response.ok) error(response.status, response.status === 404 ? 'Nincs ilyen lecke.' : 'A lecke most nem tölthető be.');
 return await response.json() as LessonDocument;
};

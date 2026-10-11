import { loadPrivatePage } from '$lib/private-page';
import type { loadClassroomPage } from '$lib/server/classroom-page';
import type { PageLoad } from './$types';

export const ssr = false;
export const load: PageLoad = async ({ params, parent }) => {
	const { user } = await parent();
	return loadPrivatePage<Awaited<ReturnType<typeof loadClassroomPage>>>(`/api/classrooms/${encodeURIComponent(params.id)}/page`, user?.id);
};

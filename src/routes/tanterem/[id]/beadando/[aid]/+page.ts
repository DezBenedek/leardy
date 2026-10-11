import { loadPrivatePage } from '$lib/private-page';
import type { loadClassroomAssignmentPage } from '$lib/server/classroom-assignment-page';
import type { PageLoad } from './$types';

export const ssr = false;
export const load: PageLoad = async ({ params, parent }) => {
	const { user } = await parent();
	return loadPrivatePage<Awaited<ReturnType<typeof loadClassroomAssignmentPage>>>(`/api/classrooms/${encodeURIComponent(params.id)}/assignments/${encodeURIComponent(params.aid)}/page`, user?.id);
};

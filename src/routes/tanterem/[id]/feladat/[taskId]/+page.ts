import { loadPrivatePage } from '$lib/private-page';
import type { loadClassroomTaskPage } from '$lib/server/classroom-task-page';
import type { PageLoad } from './$types';

export const ssr = false;
export const load: PageLoad = async ({ params, parent }) => {
	const { user } = await parent();
	return loadPrivatePage<Awaited<ReturnType<typeof loadClassroomTaskPage>>>(`/api/classrooms/${encodeURIComponent(params.id)}/tasks/${encodeURIComponent(params.taskId)}/page`, user?.id);
};

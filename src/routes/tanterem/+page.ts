import { loadPrivatePage } from '$lib/private-page';
import type { Classroom } from '$lib/server/classroom';
import type { PageLoad } from './$types';

export const ssr = false;
export const load: PageLoad = async ({ parent }) => {
	const { user } = await parent();
	return loadPrivatePage<{ teaching: Classroom[]; joined: Classroom[]; isTeacher: boolean }>('/api/classrooms', user?.id, { teaching: [], joined: [], isTeacher: user?.role === 'teacher', offline: true });
};

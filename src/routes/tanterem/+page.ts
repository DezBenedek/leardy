import { canTeach } from '$lib/admin/roles';
import { loadPrivatePage } from '$lib/platform/private-page';
import type { Classroom } from '$lib/server/classroom/classroom';
import type { PageLoad } from './$types';

export const ssr = false;
export const load: PageLoad = async ({ parent }) => {
	const { user } = await parent();
	return loadPrivatePage<{ teaching: Classroom[]; joined: Classroom[]; isTeacher: boolean }>('/api/classrooms', user?.id, { teaching: [], joined: [], isTeacher: canTeach(user?.role, user?.is_admin), offline: true });
};

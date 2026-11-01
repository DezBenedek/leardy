import type { LayoutServerLoad } from './$types';
import { getDb, requireUser } from '$lib/server/infra/db';
import { ensureAdminSchema } from '$lib/server/admin/guards';
import { adminNavFor } from '$lib/platform/navigation';

export const load: LayoutServerLoad = async (event) => {
	const db = getDb(event);
	if (!db) return { user: null, allowed: [] as string[] };
	await ensureAdminSchema(db).catch(() => {});
	const user = await requireUser(event, db);
	if (!user) return { user: null, allowed: [] as string[] };
	const allowed = adminNavFor(user.role, user.is_admin).map((item) => item.href.split('/').pop() ?? item.href);
	return { user, allowed };
};

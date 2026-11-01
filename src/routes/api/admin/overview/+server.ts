import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { requireSchoolStats } from '$lib/server/admin/guards';
import { schoolOverview } from '$lib/server/admin/stats';

export const GET: RequestHandler = async (event) => {
	try {
		const { db, user } = await requireSchoolStats(event);
		const range = Math.min(Math.max(Number(event.url.searchParams.get('range') ?? 30) || 30, 7), 180);
		const schoolId = event.url.searchParams.get('school')?.trim() || user.school_id;
		if (schoolId !== user.school_id && user.role !== 'admin' && user.role !== 'developer' && !user.is_admin) {
			return json({ error: 'Csak a saját iskolád adatait láthatod.' }, { status: 403 });
		}
		const data = await schoolOverview(db, schoolId, range);
		return json(data);
	} catch (e) {
		const status = (e as { status?: number })?.status ?? 500;
		const message = e instanceof Error ? e.message : 'Hiba történt.';
		return json({ error: message }, { status });
	}
};

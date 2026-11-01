import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { requireSchoolStats } from '$lib/server/admin/guards';
import { schoolStudents } from '$lib/server/admin/stats';

export const GET: RequestHandler = async (event) => {
	try {
		const { db, user } = await requireSchoolStats(event);
		const q = event.url.searchParams.get('q')?.slice(0, 100) ?? '';
		const roleParam = event.url.searchParams.get('role') === 'teacher' ? 'teacher' : 'student';
		const limit = Math.min(Math.max(Number(event.url.searchParams.get('limit') ?? 30) || 30, 5), 100);
		const offset = Math.max(Number(event.url.searchParams.get('offset') ?? 0) || 0, 0);
		const data = await schoolStudents(db, user.school_id, q, limit, offset, roleParam);
		return json(data);
	} catch (e) {
		const status = (e as { status?: number })?.status ?? 500;
		return json({ error: e instanceof Error ? e.message : 'Hiba történt.' }, { status });
	}
};

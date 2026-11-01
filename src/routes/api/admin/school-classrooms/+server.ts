import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { requireSchoolStats } from '$lib/server/admin/guards';

/* Saját iskola osztályai: tanár, létszám, friss beadás aktivitás. */
export const GET: RequestHandler = async (event) => {
	try {
		const { db, user } = await requireSchoolStats(event);
		const q = event.url.searchParams.get('q')?.slice(0, 100) ?? '';
		const limit = Math.min(Math.max(Number(event.url.searchParams.get('limit') ?? 30) || 30, 5), 200);
		const offset = Math.max(Number(event.url.searchParams.get('offset') ?? 0) || 0, 0);
		const needle = `%${q.trim().toLowerCase()}%`;
		const where = q.trim()
			? `AND (instr(lower(c.name), ?) > 0 OR instr(lower(u.name), ?) > 0)`
			: '';
		const bindArgs = q.trim() ? [user.school_id, needle, needle] : [user.school_id];
		const total = await db
			.prepare(
				`SELECT COUNT(*) AS n FROM classrooms c JOIN users u ON u.id = c.teacher_id
				 WHERE COALESCE(u.school_id, '') = ? ${where}`
			)
			.bind(...bindArgs)
			.first<{ n: number }>()
			.catch(() => ({ n: 0 }));
		const since = Date.now() - 30 * 24 * 3600 * 1000;
		const rows = await db
			.prepare(
				`SELECT c.id, c.name, COALESCE(u.name, '') AS teacher,
					(SELECT COUNT(*) FROM classroom_members m WHERE m.classroom_id = c.id) AS members,
					(SELECT COUNT(*) FROM classroom_tasks t WHERE t.classroom_id = c.id) AS tasks,
					(SELECT COUNT(*) FROM task_submissions s
					 WHERE s.classroom_id = c.id AND s.updated_at >= ?) AS recent_subs
				 FROM classrooms c JOIN users u ON u.id = c.teacher_id
				 WHERE COALESCE(u.school_id, '') = ? ${where}
				 ORDER BY recent_subs DESC, members DESC LIMIT ? OFFSET ?`
			)
			.bind(since, ...bindArgs, limit, offset)
			.all<{ id: string; name: string; teacher: string; members: number; tasks: number; recent_subs: number }>()
			.catch(() => ({ results: [] }));
		return json({ items: rows.results ?? [], total: total?.n ?? 0 });
	} catch (e) {
		const status = (e as { status?: number })?.status ?? 500;
		return json({ error: e instanceof Error ? e.message : 'Hiba történt.' }, { status });
	}
};

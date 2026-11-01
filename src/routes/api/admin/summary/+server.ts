import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { requireAdminRole } from '$lib/server/admin/guards';

/* Admin áttekintés a hubhoz: szerep bontás, aktív korlátozások, friss aktivitás. */
export const GET: RequestHandler = async (event) => {
	try {
		const { db } = await requireAdminRole(event, 'school_leader');
		const now = Date.now();
		const roles = await db
			.prepare(`SELECT COALESCE(role, 'student') AS role, COUNT(*) AS n FROM users GROUP BY role`)
			.all<{ role: string; n: number }>()
			.catch(() => ({ results: [] }));
		const restricted = await db
			.prepare(
				`SELECT SUM(CASE WHEN COALESCE(suspended_until, 0) > ? THEN 1 ELSE 0 END) AS banned,
					SUM(CASE WHEN COALESCE(muted_until, 0) > ? THEN 1 ELSE 0 END) AS muted,
					COUNT(*) AS total
				 FROM users`
			)
			.bind(now, now)
			.first<{ banned: number; muted: number; total: number }>()
			.catch(() => ({ banned: 0, muted: 0, total: 0 }));
		const week = await db
			.prepare(`SELECT COUNT(*) AS n FROM admin_actions WHERE created_at >= ?`)
			.bind(now - 7 * 24 * 3600 * 1000)
			.first<{ n: number }>()
			.catch(() => ({ n: 0 }));
		return json({
			roles: Object.fromEntries((roles.results ?? []).map((r) => [r.role, r.n])),
			total: restricted?.total ?? 0,
			banned: restricted?.banned ?? 0,
			muted: restricted?.muted ?? 0,
			actionsWeek: week?.n ?? 0
		});
	} catch (e) {
		const status = (e as { status?: number })?.status ?? 500;
		return json({ error: e instanceof Error ? e.message : 'Hiba történt.' }, { status });
	}
};

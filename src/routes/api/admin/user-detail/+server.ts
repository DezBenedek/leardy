import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { requireModerator } from '$lib/server/admin/guards';

/* Egy felhasználó részletei moderáláshoz: adatlap, aktivitás, napló. */
export const GET: RequestHandler = async (event) => {
	try {
		const { db } = await requireModerator(event);
		const id = event.url.searchParams.get('id')?.trim() ?? '';
		if (!id) return json({ error: 'Hiányzó azonosító.' }, { status: 400 });
		const user = await db
			.prepare(
				`SELECT id, name, email, COALESCE(role, 'student') AS role, COALESCE(school_id, '') AS school_id,
					COALESCE(xp, 0) AS xp, COALESCE(streak, 0) AS streak, COALESCE(created_at, 0) AS created_at,
					COALESCE(suspended_until, 0) AS suspended_until, COALESCE(muted_until, 0) AS muted_until,
					COALESCE(suspended_reason, '') AS suspended_reason, COALESCE(muted_reason, '') AS muted_reason
				 FROM users WHERE id = ?`
			)
			.bind(id)
			.first<{
				id: string; name: string; email: string; role: string; school_id: string;
				xp: number; streak: number; created_at: number; suspended_until: number;
				muted_until: number; suspended_reason: string; muted_reason: string;
			}>()
			.catch(() => null);
		if (!user) return json({ error: 'Nincs ilyen felhasználó.' }, { status: 404 });
		const lessons = await db
			.prepare(`SELECT COUNT(*) AS done FROM lesson_progress WHERE user_id = ? AND done = 1`)
			.bind(id)
			.first<{ done: number }>()
			.catch(() => ({ done: 0 }));
		const lastActive = await db
			.prepare(`SELECT MAX(updated_at) AS lastActive FROM lesson_progress WHERE user_id = ?`)
			.bind(id)
			.first<{ lastActive: number | null }>()
			.catch(() => ({ lastActive: null }));
		const teaching = await db
			.prepare(
				`SELECT c.id, c.name, (SELECT COUNT(*) FROM classroom_members m WHERE m.classroom_id = c.id) AS members
				 FROM classrooms c WHERE c.teacher_id = ? ORDER BY c.created_at DESC LIMIT 20`
			)
			.bind(id)
			.all<{ id: string; name: string; members: number }>()
			.catch(() => ({ results: [] }));
		const joined = await db
			.prepare(
				`SELECT c.id, c.name FROM classroom_members m JOIN classrooms c ON c.id = m.classroom_id
				 WHERE m.user_id = ? ORDER BY m.joined_at DESC LIMIT 20`
			)
			.bind(id)
			.all<{ id: string; name: string }>()
			.catch(() => ({ results: [] }));
		const subs = await db
			.prepare(
				`SELECT COUNT(*) AS total, SUM(CASE WHEN submitted = 1 THEN 1 ELSE 0 END) AS doneCount
				 FROM task_submissions WHERE user_id = ?`
			)
			.bind(id)
			.first<{ total: number; doneCount: number }>()
			.catch(() => ({ total: 0, doneCount: 0 }));
		const history = await db
			.prepare(
				`SELECT a.action, a.reason, a.created_at AS createdAt, COALESCE(u.name, '') AS actor
				 FROM admin_actions a LEFT JOIN users u ON u.id = a.actor_id
				 WHERE a.target_id = ? ORDER BY a.created_at DESC LIMIT 20`
			)
			.bind(id)
			.all<{ action: string; reason: string; createdAt: number; actor: string }>()
			.catch(() => ({ results: [] }));
		return json({
			user,
			stats: {
				lessonsDone: lessons?.done ?? 0,
				lastActive: lastActive?.lastActive ?? null,
				submissions: subs?.total ?? 0,
				submitted: subs?.doneCount ?? 0
			},
			teaching: teaching.results ?? [],
			joined: joined.results ?? [],
			history: (history.results ?? []).map((h) => ({
				action: h.action, reason: h.reason, createdAt: h.createdAt, actor: h.actor
			}))
		});
	} catch (e) {
		const status = (e as { status?: number })?.status ?? 500;
		return json({ error: e instanceof Error ? e.message : 'Hiba történt.' }, { status });
	}
};

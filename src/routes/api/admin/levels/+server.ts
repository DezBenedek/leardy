import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { requireModerator } from '$lib/server/admin/guards';

/* Tananyag lista adminnak, plusz közzététel kapcsoló. */
export const GET: RequestHandler = async (event) => {
	try {
		const { db } = await requireModerator(event);
		const q = event.url.searchParams.get('q')?.slice(0, 100) ?? '';
		const limit = Math.min(Math.max(Number(event.url.searchParams.get('limit') ?? 50) || 50, 5), 200);
		const offset = Math.max(Number(event.url.searchParams.get('offset') ?? 0) || 0, 0);
		const total = await db
			.prepare(
				`SELECT COUNT(*) AS n FROM levels l JOIN subjects s ON s.id = l.subject_id
				 WHERE (? = '' OR instr(lower(l.title), lower(?)) > 0 OR instr(lower(s.title), lower(?)) > 0)`
			)
			.bind(q, q, q)
			.first<{ n: number }>()
			.catch(() => ({ n: 0 }));
		const rows = await db
			.prepare(
				`SELECT l.id, l.title, l.subject_id, s.title AS subject_title, ls.owner_id,
					COALESCE(ls.published, 1) AS published, COALESCE(u.email, '') AS owner_email,
					(SELECT COUNT(*) FROM lessons le2 JOIN materials m2 ON m2.id = le2.material_id WHERE m2.level_id = l.id) AS lesson_count
				 FROM levels l
				 JOIN subjects s ON s.id = l.subject_id
				 LEFT JOIN level_settings ls ON ls.level_id = l.id
				 LEFT JOIN users u ON u.id = ls.owner_id
				 WHERE (? = '' OR instr(lower(l.title), lower(?)) > 0 OR instr(lower(s.title), lower(?)) > 0)
				 ORDER BY s.sort, l.sort LIMIT ? OFFSET ?`
			)
			.bind(q, q, q, limit, offset)
			.all<{ id: string; title: string; subject_id: string; subject_title: string; owner_id: string | null; published: number; owner_email: string }>()
			.catch(() => ({ results: [] }));
		return json({ items: rows.results ?? [], total: total?.n ?? 0 });
	} catch (e) {
		const status = (e as { status?: number })?.status ?? 500;
		return json({ error: e instanceof Error ? e.message : 'Hiba történt.' }, { status });
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const { db, user } = await requireModerator(event);
		const body = (await event.request.json().catch(() => ({}))) as { levelId?: string; published?: boolean };
		const levelId = String(body.levelId ?? '').trim();
		if (!levelId || typeof body.published !== 'boolean') {
			return json({ error: 'Hiányzó adat.' }, { status: 400 });
		}
		const level = await db
			.prepare(`SELECT l.id, ls.owner_id AS owner_id FROM levels l LEFT JOIN level_settings ls ON ls.level_id = l.id WHERE l.id = ?`)
			.bind(levelId)
			.first<{ id: string; owner_id: string | null }>();
		if (!level) return json({ error: 'Nincs ilyen tananyag.' }, { status: 404 });
		await db
			.prepare(
				`INSERT INTO level_settings (level_id, owner_id, published) VALUES (?, ?, ?)
				 ON CONFLICT(level_id) DO UPDATE SET published = excluded.published`
			)
			.bind(levelId, level.owner_id ?? null, body.published ? 1 : 0)
			.run();
		await db
			.prepare(`INSERT INTO admin_actions (id, actor_id, target_id, action, reason, expires_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)`)
			.bind(crypto.randomUUID(), user.id, levelId, body.published ? 'publish' : 'unpublish', '', Date.now())
			.run()
			.catch(() => {});
		return json({ ok: true });
	} catch (e) {
		const status = (e as { status?: number })?.status ?? 500;
		return json({ error: e instanceof Error ? e.message : 'Hiba történt.' }, { status });
	}
};

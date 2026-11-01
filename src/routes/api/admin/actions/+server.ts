import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { requireModerator } from '$lib/server/admin/guards';
import { recentActions } from '$lib/server/admin/moderation';

export const GET: RequestHandler = async (event) => {
	try {
		const { db } = await requireModerator(event);
		const limit = Math.min(Math.max(Number(event.url.searchParams.get('limit') ?? 20) || 20, 5), 100);
		const offset = Math.max(Number(event.url.searchParams.get('offset') ?? 0) || 0, 0);
		const items = await recentActions(db, limit, offset);
		const total = await db
			.prepare(`SELECT COUNT(*) AS n FROM admin_actions`)
			.first<{ n: number }>()
			.catch(() => ({ n: items.length }));
		return json({ items, total: total?.n ?? items.length });
	} catch (e) {
		const status = (e as { status?: number })?.status ?? 500;
		return json({ error: e instanceof Error ? e.message : 'Hiba történt.' }, { status });
	}
};

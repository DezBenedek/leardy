import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { requireDeveloper } from '$lib/server/admin/guards';
import { ensureApiKeysSchema } from '$lib/server/auth/api-keys';

export const GET: RequestHandler = async (event) => {
	try {
		const { db } = await requireDeveloper(event);
		await ensureApiKeysSchema(db);
		const rows = await db
			.prepare(
				`SELECT k.id, k.name, k.prefix, k.last_used_at AS lastUsedAt, k.created_at AS createdAt,
					COALESCE(k.revoked_at, 0) AS revokedAt, u.name AS owner, u.email AS email,
					COALESCE(u.school_id, '') AS schoolId
				 FROM api_keys k JOIN users u ON u.id = k.user_id
				 ORDER BY k.created_at DESC LIMIT 100`
			)
			.all<{
				id: string; name: string; prefix: string; lastUsedAt: number | null;
				createdAt: number; revokedAt: number; owner: string; email: string; schoolId: string;
			}>()
			.catch(() => ({ results: [] }));
		return json({
			items: (rows.results ?? []).map((r) => ({
				id: r.id,
				name: r.name,
				prefix: r.prefix,
				owner: r.owner,
				email: r.email,
				schoolId: r.schoolId,
				createdAt: r.createdAt,
				lastUsedAt: r.lastUsedAt,
				revoked: r.revokedAt > 0
			}))
		});
	} catch (e) {
		const status = (e as { status?: number })?.status ?? 500;
		return json({ error: e instanceof Error ? e.message : 'Hiba történt.' }, { status });
	}
};

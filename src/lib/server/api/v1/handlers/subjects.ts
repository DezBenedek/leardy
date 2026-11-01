import { publishedLevelSql } from '$lib/server/curriculum/curriculum-publication';
import { ok, err, strParam, type RouteCtx } from '../http';

export async function handleSubjects(ctx: RouteCtx): Promise<Response | null> {
	const { event, db, a, user, method, url, segments, head, second, third } = ctx;
	/* Tantárgyak */
	if (head === 'subjects' && method === 'GET' && !second) {
		const res = await db
			.prepare(
				`SELECT id, title, COALESCE(icon, 'book') AS icon,
					COALESCE(level_label, 'Tananyag') AS levelLabel, COALESCE(sort, 0) AS sort
				 FROM subjects ORDER BY sort, title LIMIT 200`
			)
			.all<{ id: string; title: string; icon: string; levelLabel: string; sort: number }>();
		return ok({ subjects: res.results ?? [] });
	}
	if (head === 'subjects' && method === 'GET' && second) {
		const subject = await db
			.prepare(
				`SELECT id, title, COALESCE(icon, 'book') AS icon,
					COALESCE(level_label, 'Tananyag') AS levelLabel, COALESCE(sort, 0) AS sort
				 FROM subjects WHERE id = ?`
			)
			.bind(second)
			.first();
		if (!subject) return err('Nincs ilyen tantárgy.', 404);
		if (strParam(url, 'include') === 'tree') {
			const levelsRes = await db
				.prepare(
					`SELECT id, title, COALESCE(sort, 0) AS sort FROM levels l
					 WHERE subject_id = ? AND ${publishedLevelSql('l')} ORDER BY sort, title LIMIT 200`
				)
				.bind(second)
				.all();
			const levels = (levelsRes.results ?? []) as { id: string; title: string; sort: number }[];
			let materials: unknown[] = [];
			let lessons: unknown[] = [];
			if (levels.length > 0) {
				const ids = levels.map((l) => l.id);
				const matRes = await db
					.prepare(`SELECT id, level_id AS levelId, title, COALESCE(sort, 0) AS sort FROM materials WHERE level_id IN (${ids.map(() => '?').join(', ')}) ORDER BY sort, title LIMIT 500`)
					.bind(...ids)
					.all();
				materials = matRes.results ?? [];
				const matIds = (materials as { id: string }[]).map((m) => m.id);
				if (matIds.length > 0) {
					const lesRes = await db
						.prepare(`SELECT id, material_id AS materialId, title, COALESCE(sort, 0) AS sort FROM lessons WHERE material_id IN (${matIds.map(() => '?').join(', ')}) ORDER BY sort, title LIMIT 1000`)
						.bind(...matIds)
						.all();
					lessons = lesRes.results ?? [];
				}
			}
			return ok({ subject, levels, materials, lessons });
		}
		return ok({ subject });
	}
	return null;
}

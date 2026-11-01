import { ok, err, strParam, type RouteCtx } from '../http';

export async function handleLevelsMaterials(ctx: RouteCtx): Promise<Response | null> {
	const { event, db, a, user, method, url, segments, head, second, third } = ctx;
	/* Szintek */
	if (head === 'levels' && method === 'GET' && !second) {
		const subjectId = strParam(url, 'subjectId') || strParam(url, 'subject');
		const cond = subjectId ? 'WHERE l.subject_id = ?' : '';
		const args = subjectId ? [subjectId] : [];
		const res = await db
			.prepare(
				`SELECT l.id, l.subject_id AS subjectId, l.title, COALESCE(l.sort, 0) AS sort,
					COALESCE(ls.published, 1) AS published
				 FROM levels l LEFT JOIN level_settings ls ON ls.level_id = l.id
				 ${cond} ORDER BY l.sort, l.title LIMIT 200`
			)
			.bind(...args)
			.all();
		return ok({ levels: res.results ?? [] });
	}
	if (head === 'levels' && method === 'GET' && second) {
		const row = await db
			.prepare(
				`SELECT l.id, l.subject_id AS subjectId, l.title, COALESCE(l.sort, 0) AS sort,
					COALESCE(ls.published, 1) AS published
				 FROM levels l LEFT JOIN level_settings ls ON ls.level_id = l.id WHERE l.id = ?`
			)
			.bind(second)
			.first();
		if (!row) return err('Nincs ilyen szint.', 404);
		return ok({ level: row });
	}

	/* Témakörök */
	if (head === 'materials' && method === 'GET' && !second) {
		const levelId = strParam(url, 'levelId');
		const cond = levelId ? 'WHERE m.level_id = ?' : '';
		const args = levelId ? [levelId] : [];
		const res = await db
			.prepare(
				`SELECT m.id, m.level_id AS levelId, m.title, COALESCE(m.sort, 0) AS sort
				 FROM materials m ${cond} ORDER BY m.sort, m.title LIMIT 500`
			)
			.bind(...args)
			.all();
		return ok({ materials: res.results ?? [] });
	}
	if (head === 'materials' && method === 'GET' && second) {
		const row = await db
			.prepare(`SELECT id, level_id AS levelId, title, COALESCE(sort, 0) AS sort FROM materials WHERE id = ?`)
			.bind(second)
			.first();
		if (!row) return err('Nincs ilyen témakör.', 404);
		return ok({ material: row });
	}
	return null;
}

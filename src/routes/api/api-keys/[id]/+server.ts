import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { canUsePublicApi, ensureApiKeysSchema } from '$lib/server/api-keys';

/* Egy API kulcs visszavonása: DELETE /api/api-keys/:id */

export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	if (!canUsePublicApi(user)) return json({ error: 'Az API kulcsokhoz tanári fiók kell.' }, { status: 403 });
	const id = event.params.id ?? '';
	if (!id) return json({ error: 'Hiányzik a kulcs azonosítója.' }, { status: 400 });
	try {
		await ensureApiKeysSchema(db);
		const res = await db
			.prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`)
			.bind(Date.now(), id, user.id)
			.run();
		if ((res.meta.changes ?? 0) === 0) return json({ error: 'Nincs ilyen kulcs.' }, { status: 404 });
		return json({ ok: true });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Nem sikerült visszavonni a kulcsot.' },
			{ status: 500 }
		);
	}
};

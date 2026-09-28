import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { saveLessonProgress } from '$lib/server/curriculum';

export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	// Nincs ensure: a sémát a migrációk biztosítják. Eddig minden egyes
	// haladás-mentés ~30 DDL-lekérdezéssel indult 1 sor írásához.
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Nincs bejelentkezve.' }, { status: 401 });
	const body = (await event.request.json().catch(() => null)) as {
		lessonId?: unknown;
		done?: unknown;
		score?: unknown;
		total?: unknown;
	} | null;
	const lessonId = typeof body?.lessonId === 'string' ? body.lessonId : '';
	if (!lessonId) return json({ error: 'Hiányzó lessonId.' }, { status: 400 });
	const done = body?.done === true || body?.done === 1;
	const score = typeof body?.score === 'number' ? body.score : null;
	const total = typeof body?.total === 'number' ? body.total : null;
	await saveLessonProgress(db, user.id, lessonId, done, score, total);
	return json({ ok: true });
};

import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { isTopicOwner } from '$lib/server/study';

async function ownerCard(
	db: NonNullable<ReturnType<typeof getDb>>,
	cardId: string,
	userId: string
): Promise<boolean> {
	const r = await db
		.prepare(
			`SELECT l.topic_id AS t FROM flashcards f JOIN lessons l ON l.id = f.lesson_id WHERE f.id = ?`
		)
		.bind(cardId)
		.first<{ t: string }>();
	return !!r && isTopicOwner(db, r.t, userId);
}

// PATCH /api/cards/[id] — saját kártya szerkesztése.
export const PATCH: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if (!(await ownerCard(db, id, user.id))) {
		return json({ error: 'Csak a saját kártyádat szerkesztheted.' }, { status: 403 });
	}
	let body: { front_text?: unknown; back_text?: unknown; ipa?: unknown; example?: unknown; audio_url?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const sets: string[] = [];
	const args: unknown[] = [];
	if (body.front_text !== undefined) {
		const v = String(body.front_text).trim();
		if (!v) return json({ error: 'A kérdés nem lehet üres.' }, { status: 400 });
		sets.push('front_text = ?');
		args.push(v);
	}
	if (body.back_text !== undefined) {
		const v = String(body.back_text).trim();
		if (!v) return json({ error: 'A válasz nem lehet üres.' }, { status: 400 });
		sets.push('back_text = ?');
		args.push(v);
	}
	if (body.ipa !== undefined) {
		sets.push('ipa = ?');
		args.push(String(body.ipa).trim() || null);
	}
	if (body.example !== undefined) {
		sets.push('example = ?');
		args.push(String(body.example).trim() || null);
	}
	if (body.audio_url !== undefined) {
		sets.push('audio_url = ?');
		args.push(String(body.audio_url).trim() || null);
	}
	if (sets.length === 0) return json({ error: 'Nincs mit menteni.' }, { status: 400 });
	await db.prepare(`UPDATE flashcards SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
	return json({ ok: true });
};

// DELETE /api/cards/[id] — saját kártya törlése.
export const DELETE: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if (!(await ownerCard(db, id, user.id))) {
		return json({ error: 'Csak a saját kártyádat törölheted.' }, { status: 403 });
	}
	await db.batch([
		db.prepare(`DELETE FROM user_progress WHERE flashcard_id = ?`).bind(id),
		db.prepare(`DELETE FROM flashcards WHERE id = ?`).bind(id)
	]);
	return json({ ok: true });
};

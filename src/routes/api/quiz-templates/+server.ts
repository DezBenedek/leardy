import { error, json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { getDb, requireUser } from '$lib/server/db';
import { ensureQuizTemplateSchema, listQuizTemplates } from '$lib/server/quiz-templates';
import { isTemplateSeed, questionTypeTitle, validateQuestion } from '$lib/quiz-editor';
import { normalizeQuestionImageUrl } from '$lib/question-image';

async function context(event: RequestEvent) {
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDb(event);
	if (!db) error(503, 'Az adatbázis most nem elérhető.');
	const user = await requireUser(event, db);
	if (!user) error(401, 'A saját sablonokhoz jelentkezz be.');
	await ensureQuizTemplateSchema(db);
	return { db, user };
}

async function readBody(event: RequestEvent): Promise<Record<string, unknown>> {
	if (event.request.headers.get('origin') !== event.url.origin) error(403, 'A kérés forrása érvénytelen.');
	// Az átvételi csomag is korlátozott méretű, fejléc nélküli kérésnél is.
	const reader = event.request.body?.getReader();
	if (!reader) error(400, 'Hiányzik a kérés tartalma.');
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > 256 * 1024) { await reader.cancel(); error(413, 'Túl nagy sabloncsomag.'); }
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
	const raw = new TextDecoder().decode(bytes);
	let body: unknown;
	try { body = JSON.parse(raw); } catch { error(400, 'Hibás kérés.'); }
	if (!body || typeof body !== 'object' || Array.isArray(body)) error(400, 'Hibás kérés.');
	return body as Record<string, unknown>;
}

export const GET: RequestHandler = async (event) => {
	const { db, user } = await context(event);
	return json({ templates: await listQuizTemplates(db, user.id) });
};

export const POST: RequestHandler = async (event) => {
	const { db, user } = await context(event);
	const body = await readBody(event);
	if (!Array.isArray(body.templates) || !body.templates.length || body.templates.length > 30) error(400, 'Érvénytelen sabloncsomag.');
	const statements = body.templates.map((item: unknown) => {
		if (!isTemplateSeed(item)) error(400, 'Érvénytelen sablon.');
		if (JSON.stringify(item).length > 16000) error(400, 'A sablon túl hosszú.');
		const problem = validateQuestion(item);
		if (problem) error(400, problem);
		const legacyKey = 'key' in item ? item.key : null;
		if (body.legacy === true && (typeof legacyKey !== 'string' || !legacyKey || legacyKey.length > 100)) error(400, 'Érvénytelen régi sablonazonosító.');
		const seed = {
			type: item.type, title: item.title.trim().slice(0, 160) || `${questionTypeTitle(item.type)} sablonom`,
			subtitle: item.subtitle.trim().slice(0, 160), question_text: item.question_text.trim(),
			imageUrl: normalizeQuestionImageUrl(item.imageUrl) || undefined,
			options: item.options, pairs: item.pairs, correct_answer: item.correct_answer
		};
		const key = body.legacy === true ? `legacy:${legacyKey}` : crypto.randomUUID();
		return db.prepare(`INSERT INTO quiz_templates (user_id, id, seed_json, created_at) VALUES (?, ?, ?, ?)
			ON CONFLICT(user_id, id) DO NOTHING`).bind(user.id, key, JSON.stringify(seed), Date.now());
	});
	await db.batch(statements);
	return json({ templates: await listQuizTemplates(db, user.id) }, { status: 201 });
};

export const DELETE: RequestHandler = async (event) => {
	const { db, user } = await context(event);
	const body = await readBody(event);
	if (typeof body.key !== 'string' || !body.key || body.key.length > 110) error(400, 'Hiányzik a sablonazonosító.');
	const result = await db.prepare('DELETE FROM quiz_templates WHERE user_id = ? AND id = ?').bind(user.id, body.key).run();
	if (!result.meta.changes) error(404, 'Nincs ilyen saját sablon.');
	return json({ templates: await listQuizTemplates(db, user.id) });
};

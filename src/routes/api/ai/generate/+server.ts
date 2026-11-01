import { error, json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/infra/db';
import { editorContext, getEditorLesson } from '$lib/server/curriculum/curriculum-editor';
import {
	aiLimits,
	generateAiDrafts,
	isValidAiDifficulty,
	isValidAiFocus,
	isValidAiKind,
	type AiDifficulty,
	type AiFocus,
	type AiKind
} from '$lib/server/curriculum/ai-generate';

/* AI generálás a lecke szövegéből: kvíz vagy kártya piszkozatok.
   Csak szerkesztői joggal, mindig piszkozatot ad, mentés külön történik.
   Szerver secret: AI_API_KEY, opcionálisan AI_MODEL, AI_BASE_URL
   (wrangler secret put AI_API_KEY, helyi fejlesztéshez .dev.vars). */

export const POST: RequestHandler = async (event) => {
	if (event.request.headers.get('origin') !== event.url.origin) error(403, 'A kérés forrása érvénytelen.');
	const db = getDb(event);
	if (!db) error(503, 'Az adatbázis most nem elérhető.');
	const { user } = await editorContext(event);
	const body = await event.request.json().catch(() => null) as {
		lessonId?: unknown;
		kind?: unknown;
		count?: unknown;
		sectionSlug?: unknown;
		sectionSlugs?: unknown;
		difficulty?: unknown;
		focus?: unknown;
	} | null;
	if (!body || typeof body !== 'object') error(400, 'Érvénytelen kérés.');
	const kind: AiKind = isValidAiKind(body.kind) ? body.kind : 'quiz';
	const max = aiLimits(kind);
	const count = typeof body.count === 'number' ? body.count : (typeof body.count === 'string' ? Number(body.count) : NaN);
	if (!Number.isInteger(count) || count < 1 || count > max) {
		error(400, `A darabszám 1 és ${max} között lehet.`);
	}
	const lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : '';
	if (!lessonId) error(400, 'Hiányzik a lecke.');
	const sectionSlug = typeof body.sectionSlug === 'string' ? body.sectionSlug.trim().slice(0, 100) : '';
	const sectionSlugs = Array.isArray(body.sectionSlugs)
		? (body.sectionSlugs as unknown[]).map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, 50)
		: [];
	const difficulty: AiDifficulty = isValidAiDifficulty(body.difficulty) ? body.difficulty : 'normal';
	const focus: AiFocus = isValidAiFocus(body.focus) ? body.focus : 'mixed';
	// Jogosultság: a lecke tananyagának szerkesztője kell.
	await getEditorLesson(db, user, lessonId);
	const env = (event.platform?.env ?? {}) as { AI_API_KEY?: string; AI_MODEL?: string; AI_BASE_URL?: string };
	const result = await generateAiDrafts(db, user, env, { lessonId, kind, count, sectionSlug, sectionSlugs, difficulty, focus });
	return json({ ok: true, kind, drafts: result.drafts, skipped: result.skipped, truncated: result.truncated }, { headers: { 'cache-control': 'no-store' } });
};

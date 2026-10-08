import { error, json, type RequestHandler } from '@sveltejs/kit';
import { canEnterEditor, editorContext, getEditorLevels, mutateCurriculum } from '$lib/server/curriculum-editor';

export const GET: RequestHandler = async (event) => {
	const { db, user } = await editorContext(event);
	if (!await canEnterEditor(db, user)) error(403, 'Nincs szerkesztési jogosultságod.');
	const subjectId = event.url.searchParams.get('subject') ?? '';
	return json({ levels: await getEditorLevels(db, user, subjectId) }, { headers: { 'cache-control': 'no-store' } });
};

export const POST: RequestHandler = async (event) => {
	if (event.request.headers.get('origin') !== event.url.origin) error(403, 'A kérés forrása érvénytelen.');
	const { db, user } = await editorContext(event);
	const body: unknown = await event.request.json().catch(() => null);
	if (!body || typeof body !== 'object' || Array.isArray(body)) error(400, 'Érvénytelen kérés.');
	const result = await mutateCurriculum(db, user, body as Record<string, unknown>);
	return json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
};

import { error, json, type RequestHandler } from '@sveltejs/kit';
import { editorContext, searchEditorCandidates } from '$lib/server/curriculum-editor';

export const GET: RequestHandler = async (event) => {
	const { db, user } = await editorContext(event);
	const levelId = event.url.searchParams.get('level') ?? '';
	if (!levelId) error(400, 'Válassz szintet.');
	const users = await searchEditorCandidates(db, user, levelId, event.url.searchParams.get('q') ?? '', 9);
	return json({ users: users.slice(0, 8), hasMore: users.length > 8 }, { headers: { 'cache-control': 'no-store' } });
};

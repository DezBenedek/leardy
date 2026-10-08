import { error } from '@sveltejs/kit';
import { listSubjects } from '$lib/server/curriculum';
import { canCreateLevel, canEnterEditor, countEditorLevelsBySubject, editorContext, getEditorLevels } from '$lib/server/curriculum-editor';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	event.setHeaders({ 'cache-control': 'no-store' });
	const { db, user } = await editorContext(event);
	if (!await canEnterEditor(db, user)) error(403, 'A tananyag szerkesztéséhez tanári vagy szerkesztői jogosultság szükséges.');
	const [listedSubjects, levelCounts] = await Promise.all([listSubjects(db), countEditorLevelsBySubject(db, user)]);
	const subjects = listedSubjects.map((subject) => ({ ...subject, levelCount: levelCounts[subject.id] ?? 0 }));
	const requestedSubject = event.url.searchParams.get('subject') ?? '';
	const subjectId = subjects.find((subject) => subject.id === requestedSubject)?.id ?? '';
	const levels = (await getEditorLevels(db, user, subjectId)).filter((level) => level.canEdit);
	const requestedLevel = event.url.searchParams.get('level');
	const levelId = levels.find((level) => level.id === requestedLevel)?.id ?? '';
	const invalidLevel = !!requestedLevel && !levelId;
	return { subjects, subjectId: invalidLevel ? '' : subjectId, levels: invalidLevel ? [] : levels, levelId, canCreate: canCreateLevel(user) };
};

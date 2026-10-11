import { editorContext, getEditorLesson, getEditorQuizzes } from '$lib/server/curriculum-editor';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	event.setHeaders({ 'cache-control': 'no-store' });
	const { db, user } = await editorContext(event);
	const lesson = await getEditorLesson(db, user, event.params.id);
	return { lesson, quizzes: await getEditorQuizzes(db, user, lesson.id) };
};

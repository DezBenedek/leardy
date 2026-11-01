import { editorContext, getEditorLesson, getEditorLessonDecks, getEditorQuizzes } from '$lib/server/curriculum/curriculum-editor';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	event.setHeaders({ 'cache-control': 'no-store' });
	const { db, user } = await editorContext(event);
	const lesson = await getEditorLesson(db, user, event.params.id);
	return { lesson, quizzes: await getEditorQuizzes(db, user, lesson.id), decks: await getEditorLessonDecks(db, user, lesson.id) };
};

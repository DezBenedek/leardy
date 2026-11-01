import { editorContext, getEditorLesson, getEditorLessonDeckCards } from '$lib/server/curriculum/curriculum-editor';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	event.setHeaders({ 'cache-control': 'no-store' });
	const { db, user } = await editorContext(event);
	const lesson = await getEditorLesson(db, user, event.params.id);
	const { deck, cards } = await getEditorLessonDeckCards(db, user, lesson.id, event.params.deckId);
	return { lesson, deck, cards };
};

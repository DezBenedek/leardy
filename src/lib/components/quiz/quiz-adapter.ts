/* Kvíz tárhely adapter: a szerkesztőfelület (QuizEditorCore) ezen keresztül
   perzisztál, a tananyaghoz kötés csak itt jelenik meg. A lecke szerkesztő a
   tantervi API-t használja, a későbbi saját (privát) tanári kvízek másik
   adaptert kapnak ugyanahhoz a felülethez. */

import { editCurriculum } from '$lib/curriculum-edit-api';
import { draftCorrectAnswer, draftOptionsJson, type QuestionDraft } from '$lib/quiz-editor';

export interface QuizAdapter {
	uploadImage?: (file: File) => Promise<string>;
	createQuiz(title: string, sectionSlug: string): Promise<{ id: string }>;
	renameQuiz(quizId: string, title: string, sectionSlug: string): Promise<void>;
	deleteQuiz(quizId: string): Promise<void>;
	duplicateQuiz(quizId: string): Promise<{ id: string }>;
	reorderQuizzes(ids: string[]): Promise<void>;
	saveQuestion(quizId: string, draft: QuestionDraft, questionId?: string): Promise<{ id: string }>;
	deleteQuestion(questionId: string): Promise<void>;
	duplicateQuestion(questionId: string): Promise<{ id: string }>;
	reorderQuestions(quizId: string, ids: string[]): Promise<void>;
	reorderLessonQuestions(ids: string[]): Promise<{ assignments: { id: string; quizId: string }[] }>;
	moveQuestion(questionId: string, targetQuizId: string): Promise<void>;
}

/** Lecke kvízblokk adapter a tantervi szerkesztő API-ra építve. */
export function createLessonQuizAdapter(levelId: string, lessonId: string): QuizAdapter {
	return {
		uploadImage: async (file) => {
			const form = new FormData();
			form.set('lessonId', lessonId);
			form.set('file', file);
			const response = await fetch('/api/quiz-images', { method: 'POST', body: form });
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.message ?? result.error ?? 'A kép feltöltése nem sikerült. Próbáld újra.');
			return result.imageUrl;
		},
		createQuiz: (title, sectionSlug) =>
			editCurriculum<{ id: string }>({ action: 'createQuiz', levelId, lessonId, title, sectionSlug }),
		renameQuiz: async (quizId, title, sectionSlug) => {
			await editCurriculum({ action: 'renameQuiz', levelId, quizId, title, sectionSlug });
		},
		deleteQuiz: async (quizId) => {
			await editCurriculum({ action: 'deleteQuiz', levelId, quizId });
		},
		duplicateQuiz: (quizId) =>
			editCurriculum<{ id: string }>({ action: 'duplicateQuiz', levelId, quizId }),
		reorderQuizzes: async (ids) => {
			await editCurriculum({ action: 'reorderQuizzes', levelId, lessonId, ids });
		},
		saveQuestion: (quizId, draft, questionId) =>
			editCurriculum<{ id: string }>({
				action: 'saveQuestion',
				levelId,
				quizId,
				questionId: questionId ?? '',
				question_text: draft.question_text.trim(),
				type: draft.type,
				options_json: draftOptionsJson(draft),
				correct_answer: draftCorrectAnswer(draft),
				sectionSlug: (draft.sectionSlug || '').trim()
			}),
		deleteQuestion: async (questionId) => {
			await editCurriculum({ action: 'deleteQuestion', levelId, questionId });
		},
		duplicateQuestion: (questionId) =>
			editCurriculum<{ id: string }>({ action: 'duplicateQuestion', levelId, questionId }),
		reorderQuestions: async (quizId, ids) => {
			await editCurriculum({ action: 'reorderQuestions', levelId, quizId, ids });
		},
		reorderLessonQuestions: (ids) =>
			editCurriculum({ action: 'reorderLessonQuestions', levelId, lessonId, ids }),
		moveQuestion: async (questionId, targetQuizId) => {
			await editCurriculum({ action: 'moveQuestion', levelId, questionId, targetQuizId });
		}
	};
}

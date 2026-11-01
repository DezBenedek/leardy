/* Kvíz tárhely adapter: a szerkesztőfelület (QuizEditorCore) ezen keresztül
   perzisztál, a tananyaghoz kötés csak itt jelenik meg. Egy leckéhez egy kvíz
   tartozik: a kvíz lusta létrehozású, külön kvíz műveletek nincsenek. */

import { editCurriculum } from '$lib/curriculum/curriculum-edit-api';
import { draftCorrectAnswer, draftOptionsJson, type QuestionDraft } from '$lib/quiz/quiz-editor';

export interface QuizAdapter {
	uploadImage?: (file: File) => Promise<string>;
	ensureQuiz(): Promise<{ id: string }>;
	saveQuestion(quizId: string, draft: QuestionDraft, questionId?: string): Promise<{ id: string }>;
	saveQuestions(drafts: QuestionDraft[]): Promise<{ quizId: string; ids: string[] }>;
	deleteQuestion(questionId: string): Promise<void>;
	duplicateQuestion(questionId: string): Promise<{ id: string }>;
	reorderQuestions(quizId: string, ids: string[]): Promise<void>;
}

/** Lecke kvíz adapter a tantervi szerkesztő API-ra építve. */
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
		ensureQuiz: () =>
			editCurriculum<{ id: string }>({ action: 'ensureLessonQuiz', levelId, lessonId }),
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
		saveQuestions: async (drafts) => {
			const targetQuizId = await editCurriculum<{ id: string }>({ action: 'ensureLessonQuiz', levelId, lessonId }).then((r) => r.id);
			const result = await editCurriculum<{ quizId: string; ids: string[] }>({
				action: 'saveLessonQuestions',
				levelId,
				lessonId,
				quizId: targetQuizId,
				questions: drafts.map((draft) => ({
					question_text: draft.question_text.trim(),
					type: draft.type,
					options_json: draftOptionsJson(draft),
					correct_answer: draftCorrectAnswer(draft),
					sectionSlug: (draft.sectionSlug || '').trim()
				}))
			});
			return result;
		},
		deleteQuestion: async (questionId) => {
			await editCurriculum({ action: 'deleteQuestion', levelId, questionId });
		},
		duplicateQuestion: (questionId) =>
			editCurriculum<{ id: string }>({ action: 'duplicateQuestion', levelId, questionId }),
		reorderQuestions: async (quizId, ids) => {
			await editCurriculum({ action: 'reorderQuestions', levelId, quizId, ids });
		}
	};
}

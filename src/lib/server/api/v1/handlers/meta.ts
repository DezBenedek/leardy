import { ok } from '../http';
import type { RouteCtx } from '../http';
import { openapi } from '../openapi';

export async function handleMeta(ctx: RouteCtx): Promise<Response | null> {
	const { event, db, a, user, method, url, segments, head, second, third } = ctx;
	/* Névjegy és OpenAPI */
	if (!head) {
		return ok({
			name: 'Leardy Public API',
			version: 'v1',
			user: { id: user.id, name: user.name, email: user.email, role: user.role },
			endpoints: [
				'GET /api/v1/me',
				'GET /api/v1/subjects, GET /api/v1/subjects/:id',
				'GET /api/v1/levels?subjectId=, GET /api/v1/levels/:id',
				'GET /api/v1/materials?levelId=, GET /api/v1/materials/:id',
				'GET /api/v1/lessons?materialId=&subjectId=&search=&limit=&offset=, GET/POST /api/v1/lessons, GET/PATCH/DELETE /api/v1/lessons/:id',
				'GET /api/v1/quizzes?lessonId=, POST /api/v1/quizzes, GET/PATCH/DELETE /api/v1/quizzes/:id',
				'GET /api/v1/quiz-questions?quizId=, POST /api/v1/quiz-questions, GET/PATCH/DELETE /api/v1/quiz-questions/:id',
				'GET /api/v1/card-packs?subjectId=&lessonId=, POST /api/v1/card-packs, GET/PATCH/DELETE /api/v1/card-packs/:id',
				'GET /api/v1/lesson-cards?lessonId=&packId=, POST /api/v1/lesson-cards, GET/PATCH/DELETE /api/v1/lesson-cards/:id',
				'GET /api/v1/decks, POST /api/v1/decks, GET/PATCH/DELETE /api/v1/decks/:id',
				'GET /api/v1/deck-cards?deckId=, POST /api/v1/deck-cards, GET/PATCH/DELETE /api/v1/deck-cards/:id',
				'GET /api/v1/progress/lessons?lessonId=, POST /api/v1/progress/lessons',
				'GET /api/v1/progress/cards, GET /api/v1/progress/cards/due?pack=&deck=&lesson=, POST /api/v1/progress/cards/review',
				'GET /api/v1/progress/stats',
				'GET /api/v1/library, POST /api/v1/library, DELETE /api/v1/library',
				'GET /api/v1/search?q=&subjectId=',
				'GET /api/v1/openapi.json'
			],
			docs: 'https://leardy.dezso.hu/docs/public-api'
		});
	}
	if (head === 'openapi.json' && method === 'GET') return ok(openapi());
	if (head === 'me' && method === 'GET') {
		return ok({ user: { id: user.id, name: user.name, email: user.email, role: user.role, xp: user.xp ?? 0, streak: user.streak ?? 0 }, keyId: a.keyId || null, via: a.via });
	}
	return null;
}

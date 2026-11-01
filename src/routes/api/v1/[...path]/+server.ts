import type { RequestHandler } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import { getDb, type PublicUser } from '$lib/server/infra/db';
import type { ApiAuth } from '$lib/server/auth/api-keys';
import { ensureCurriculumSchema } from '$lib/server/curriculum/curriculum';
import { CORS, err, type RouteCtx } from '$lib/server/api/v1/http';
import { auth } from '$lib/server/api/v1/auth-guard';
import { handleMeta } from '$lib/server/api/v1/handlers/meta';
import { handleSubjects } from '$lib/server/api/v1/handlers/subjects';
import { handleLevelsMaterials } from '$lib/server/api/v1/handlers/levels-materials';
import { handleLessons } from '$lib/server/api/v1/handlers/lessons';
import { handleQuizzes } from '$lib/server/api/v1/handlers/quizzes';
import { handleQuizQuestions } from '$lib/server/api/v1/handlers/quiz-questions';
import { handleCardPacks } from '$lib/server/api/v1/handlers/card-packs';
import { handleLessonCards } from '$lib/server/api/v1/handlers/lesson-cards';
import { handleDecks } from '$lib/server/api/v1/handlers/decks';
import { handleDeckCards } from '$lib/server/api/v1/handlers/deck-cards';
import { handleProgress } from '$lib/server/api/v1/handlers/progress';
import { handleLibrarySearch } from '$lib/server/api/v1/handlers/library-search';

/* Leardy Publikus API v1.
   Hitelesítés: Authorization: Bearer ld_... (tanári API kulcs),
   vagy X-Api-Key fejléc, vagy api_key query paraméter.
   Minden végpont tanári vagy admin fiók kulcsát igényli.
   Válaszok: JSON, hiba esetén { error }.
   Dokumentáció: GET /api/v1/ és docs/public-api.md. */

/* Fő útválasztó: /api/v1/[...path] */
async function route(
	event: Parameters<RequestHandler>[0],
	db: D1Database,
	a: ApiAuth,
	segments: string[]
): Promise<Response> {
	const user = a.user;
	const method = event.request.method.toUpperCase();
	const url = event.url;
	const [head, second, third] = segments;
	const ctx: RouteCtx = { event, db, a, user, method, url, segments, head, second, third };
	const handlers = [
		handleMeta,
		handleSubjects,
		handleLevelsMaterials,
		handleLessons,
		handleQuizzes,
		handleQuizQuestions,
		handleCardPacks,
		handleLessonCards,
		handleDecks,
		handleDeckCards,
		handleProgress,
		handleLibrarySearch
	];
	for (const h of handlers) {
		const res = await h(ctx);
		if (res) return res;
	}
	return err(`Ismeretlen végpont: /api/v1/${segments.join('/')}`, 404);
}

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { status: 204, headers: CORS });
};

const HANDLER: RequestHandler = async (event) => {
	if (event.request.method.toUpperCase() === 'OPTIONS') {
		return new Response(null, { status: 204, headers: CORS });
	}
	const db = getDb(event);
	if (!db) return err('Az adatbázis most nem elérhető.', 503);
	const a = await auth(event, db);
	if (a instanceof Response) return a;
	const raw = event.params.path ?? '';
	const segments = raw.split('/').map((s) => s.trim()).filter(Boolean).slice(0, 5);
	try {
		try {
			await ensureCurriculumSchema(db);
		} catch {
			// olvasás séma nélkül is mehet
		}
		return await route(event, db, a, segments);
	} catch (e) {
		return err(e instanceof Error ? e.message : 'Váratlan hiba.', 500);
	}
};

export const GET: RequestHandler = HANDLER;
export const POST: RequestHandler = HANDLER;
export const PATCH: RequestHandler = HANDLER;
export const PUT: RequestHandler = HANDLER;
export const DELETE: RequestHandler = HANDLER;

export type { PublicUser };

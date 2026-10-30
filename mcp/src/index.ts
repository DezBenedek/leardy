import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

/* Leardy MCP szerver a publikus API v1-re.
   Minden eszköz a kulcs tulajdonosának nevében jár el.
   Konfiguráció környezeti változókkal:
   LEARDY_BASE_URL (alap: https://leardy.dezso.hu),
   LEARDY_API_KEY (kötelező, ld_... tanári kulcs). */

function baseUrl(): string {
	return (process.env.LEARDY_BASE_URL ?? 'https://leardy.dezso.hu').replace(/\/+$/, '');
}

function apiKey(): string {
	return (process.env.LEARDY_API_KEY ?? '').trim();
}

interface ApiResult {
	ok: boolean;
	status: number;
	data: unknown;
}

async function callApi(path: string, init?: RequestInit): Promise<ApiResult> {
	const key = apiKey();
	if (!key) {
		return { ok: false, status: 0, data: 'Hiányzik a LEARDY_API_KEY környezeti változó. Hozz létre kulcsot a Beállítások, Fejlesztői beállítások alatt.' };
	}
	const url = `${baseUrl()}${path}`;
	let res: Response;
	try {
		res = await fetch(url, {
			...init,
			headers: {
				authorization: `Bearer ${key}`,
				'content-type': 'application/json',
				...(init?.headers ?? {})
			}
		});
	} catch (e) {
		return { ok: false, status: 0, data: `Hálózati hiba: ${e instanceof Error ? e.message : 'ismeretlen'}` };
	}
	let data: unknown = null;
	try {
		data = await res.json();
	} catch {
		data = null;
	}
	return { ok: res.ok, status: res.status, data };
}

async function get(path: string) {
	return callApi(path, { method: 'GET' });
}

async function send(path: string, method: string, body?: unknown) {
	return callApi(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

function text(data: unknown) {
	const out = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
	return { content: [{ type: 'text' as const, text: out }] };
}

function fail(result: ApiResult) {
	const detail = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
	return {
		content: [{ type: 'text' as const, text: `API hiba (HTTP ${result.status}): ${detail}` }],
		isError: true as const
	};
}

function done(result: ApiResult) {
	return result.ok ? text(result.data) : fail(result);
}

function query(params: Record<string, string | number | boolean | undefined>): string {
	const parts: string[] = [];
	for (const [k, v] of Object.entries(params)) {
		if (v === undefined || v === '') continue;
		parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
	}
	return parts.length > 0 ? `?${parts.join('&')}` : '';
}

function createServer(): McpServer {
	const server = new McpServer({ name: 'leardy', version: '1.0.0' });

	server.registerTool(
		'me',
		{ description: 'Saját fiók és API kulcs adatok lekérése', inputSchema: z.object({}) },
		async () => done(await get('/api/v1/me'))
	);

	server.registerTool(
		'list-subjects',
		{ description: 'Tantárgyak listázása', inputSchema: z.object({}) },
		async () => done(await get('/api/v1/subjects'))
	);

	server.registerTool(
		'get-subject',
		{
			description: 'Egy tantárgy részletei, igény szerint teljes fával',
			inputSchema: z.object({
				id: z.string().describe('Tantárgy azonosító'),
				includeTree: z.boolean().optional().describe('Szintek, témakörök és leckék is jöjjenek')
			})
		},
		async ({ id, includeTree }) =>
			done(await get(`/api/v1/subjects/${encodeURIComponent(id)}${includeTree === false ? '' : '?include=tree'}`))
	);

	server.registerTool(
		'list-levels',
		{
			description: 'Szintek listázása, tantárgyra szűrhető',
			inputSchema: z.object({ subjectId: z.string().optional().describe('Tantárgy azonosító') })
		},
		async ({ subjectId }) => done(await get(`/api/v1/levels${query({ subjectId })}`))
	);

	server.registerTool(
		'list-materials',
		{
			description: 'Témakörök listázása, szintre szűrhető',
			inputSchema: z.object({ levelId: z.string().optional().describe('Szint azonosító') })
		},
		async ({ levelId }) => done(await get(`/api/v1/materials${query({ levelId })}`))
	);

	server.registerTool(
		'list-lessons',
		{
			description: 'Leckék listázása és keresése',
			inputSchema: z.object({
				materialId: z.string().optional(),
				subjectId: z.string().optional(),
				search: z.string().optional().describe('Keresőkifejezés címre és szövegre'),
				limit: z.number().int().min(1).max(200).optional(),
				offset: z.number().int().min(0).optional()
			})
		},
		async (args) => done(await get(`/api/v1/lessons${query(args)}`))
	);

	server.registerTool(
		'get-lesson',
		{
			description: 'Egy lecke szövege, igény szerint kvízekkel és kártyákkal',
			inputSchema: z.object({
				id: z.string().describe('Lecke azonosító'),
				include: z.string().optional().describe('quizzes, cards vagy all')
			})
		},
		async ({ id, include }) =>
			done(await get(`/api/v1/lessons/${encodeURIComponent(id)}${query({ include })}`))
	);

	server.registerTool(
		'create-lesson',
		{
			description: 'Új lecke létrehozása egy témakörben, szerkesztői jog kell',
			inputSchema: z.object({
				materialId: z.string(),
				title: z.string(),
				bodyMd: z.string().optional().describe('Lecke szövege markdown formátumban'),
				sort: z.number().optional()
			})
		},
		async (args) => done(await send('/api/v1/lessons', 'POST', args))
	);

	server.registerTool(
		'update-lesson',
		{
			description: 'Lecke szerkesztése, szerkesztői jog kell',
			inputSchema: z.object({
				id: z.string(),
				title: z.string().optional(),
				bodyMd: z.string().optional(),
				materialId: z.string().optional(),
				sort: z.number().optional()
			})
		},
		async ({ id, ...rest }) => done(await send(`/api/v1/lessons/${encodeURIComponent(id)}`, 'PATCH', rest))
	);

	server.registerTool(
		'delete-lesson',
		{
			description: 'Lecke törlése a kvízeivel és kártyáival, szerkesztői jog kell',
			inputSchema: z.object({ id: z.string() })
		},
		async ({ id }) => done(await send(`/api/v1/lessons/${encodeURIComponent(id)}`, 'DELETE'))
	);

	server.registerTool(
		'list-quizzes',
		{
			description: 'Kvízek listázása leckére vagy tantárgyra szűrve',
			inputSchema: z.object({
				lessonId: z.string().optional(),
				subjectId: z.string().optional(),
				include: z.string().optional().describe('questions értékkel a kérdések is jönnek'),
				limit: z.number().int().min(1).max(200).optional(),
				offset: z.number().int().min(0).optional()
			})
		},
		async (args) => done(await get(`/api/v1/quizzes${query(args)}`))
	);

	server.registerTool(
		'get-quiz',
		{
			description: 'Egy kvíz kérdésekkel',
			inputSchema: z.object({ id: z.string() })
		},
		async ({ id }) => done(await get(`/api/v1/quizzes/${encodeURIComponent(id)}`))
	);

	server.registerTool(
		'create-quiz',
		{
			description: 'Új kvíz egy leckéhez, szerkesztői jog kell',
			inputSchema: z.object({
				lessonId: z.string(),
				title: z.string(),
				sectionSlug: z.string().optional(),
				sort: z.number().optional()
			})
		},
		async (args) => done(await send('/api/v1/quizzes', 'POST', args))
	);

	server.registerTool(
		'update-quiz',
		{
			description: 'Kvíz szerkesztése, szerkesztői jog kell',
			inputSchema: z.object({
				id: z.string(),
				title: z.string().optional(),
				sectionSlug: z.string().optional(),
				sort: z.number().optional(),
				lessonId: z.string().optional()
			})
		},
		async ({ id, ...rest }) => done(await send(`/api/v1/quizzes/${encodeURIComponent(id)}`, 'PATCH', rest))
	);

	server.registerTool(
		'delete-quiz',
		{
			description: 'Kvíz törlése a kérdéseivel, szerkesztői jog kell',
			inputSchema: z.object({ id: z.string() })
		},
		async ({ id }) => done(await send(`/api/v1/quizzes/${encodeURIComponent(id)}`, 'DELETE'))
	);

	const questionType = z.string().describe('choice, true-false, text, gap, match, order vagy map');

	server.registerTool(
		'list-quiz-questions',
		{
			description: 'Egy kvíz kérdéseinek listázása',
			inputSchema: z.object({ quizId: z.string() })
		},
		async ({ quizId }) => done(await get(`/api/v1/quiz-questions${query({ quizId })}`))
	);

	server.registerTool(
		'create-quiz-question',
		{
			description: 'Új kérdés egy kvízhez, szerkesztői jog kell',
			inputSchema: z.object({
				quizId: z.string(),
				questionText: z.string(),
				type: questionType.optional(),
				options: z.array(z.string()).optional().describe('Válaszlehetőségek choice típushoz'),
				correctAnswer: z.string().optional(),
				sectionSlug: z.string().optional(),
				sort: z.number().optional()
			})
		},
		async (args) => done(await send('/api/v1/quiz-questions', 'POST', args))
	);

	server.registerTool(
		'update-quiz-question',
		{
			description: 'Kérdés szerkesztése, szerkesztői jog kell',
			inputSchema: z.object({
				id: z.string(),
				questionText: z.string().optional(),
				type: questionType.optional(),
				options: z.array(z.string()).optional(),
				correctAnswer: z.string().optional(),
				sectionSlug: z.string().optional(),
				sort: z.number().optional()
			})
		},
		async ({ id, ...rest }) => done(await send(`/api/v1/quiz-questions/${encodeURIComponent(id)}`, 'PATCH', rest))
	);

	server.registerTool(
		'delete-quiz-question',
		{
			description: 'Kérdés törlése, szerkesztői jog kell',
			inputSchema: z.object({ id: z.string() })
		},
		async ({ id }) => done(await send(`/api/v1/quiz-questions/${encodeURIComponent(id)}`, 'DELETE'))
	);

	server.registerTool(
		'list-card-packs',
		{
			description: 'Hivatalos kártyacsomagok listázása',
			inputSchema: z.object({
				subjectId: z.string().optional(),
				lessonId: z.string().optional(),
				limit: z.number().int().min(1).max(200).optional(),
				offset: z.number().int().min(0).optional()
			})
		},
		async (args) => done(await get(`/api/v1/card-packs${query(args)}`))
	);

	server.registerTool(
		'get-card-pack',
		{
			description: 'Egy hivatalos csomag kártyákkal',
			inputSchema: z.object({ id: z.string() })
		},
		async ({ id }) => done(await get(`/api/v1/card-packs/${encodeURIComponent(id)}`))
	);

	server.registerTool(
		'create-card-pack',
		{
			description: 'Hivatalos csomag létrehozása, szerkesztői jog kell',
			inputSchema: z.object({
				lessonId: z.string(),
				title: z.string(),
				cardKind: z.string().optional().describe('word vagy study'),
				sort: z.number().optional(),
				lessonIds: z.array(z.string()).optional().describe('További csatolt leckék')
			})
		},
		async (args) => done(await send('/api/v1/card-packs', 'POST', args))
	);

	server.registerTool(
		'update-card-pack',
		{
			description: 'Hivatalos csomag szerkesztése, szerkesztői jog kell',
			inputSchema: z.object({
				id: z.string(),
				title: z.string().optional(),
				cardKind: z.string().optional(),
				sort: z.number().optional(),
				lessonId: z.string().optional(),
				lessonIds: z.array(z.string()).optional()
			})
		},
		async ({ id, ...rest }) => done(await send(`/api/v1/card-packs/${encodeURIComponent(id)}`, 'PATCH', rest))
	);

	server.registerTool(
		'delete-card-pack',
		{
			description: 'Hivatalos csomag törlése, szerkesztői jog kell',
			inputSchema: z.object({ id: z.string() })
		},
		async ({ id }) => done(await send(`/api/v1/card-packs/${encodeURIComponent(id)}`, 'DELETE'))
	);

	server.registerTool(
		'list-lesson-cards',
		{
			description: 'Hivatalos kártyák listázása, lessonId vagy packId kötelező',
			inputSchema: z.object({
				lessonId: z.string().optional(),
				packId: z.string().optional(),
				limit: z.number().int().min(1).max(1000).optional(),
				offset: z.number().int().min(0).optional()
			})
		},
		async (args) => done(await get(`/api/v1/lesson-cards${query(args)}`))
	);

	server.registerTool(
		'create-lesson-card',
		{
			description: 'Hivatalos kártya létrehozása, szerkesztői jog kell',
			inputSchema: z.object({
				lessonId: z.string(),
				front: z.string().describe('Kártya előlapja'),
				back: z.string().describe('Kártya hátlapja'),
				packId: z.string().optional(),
				sectionSlug: z.string().optional()
			})
		},
		async (args) => done(await send('/api/v1/lesson-cards', 'POST', args))
	);

	server.registerTool(
		'update-lesson-card',
		{
			description: 'Hivatalos kártya szerkesztése, szerkesztői jog kell',
			inputSchema: z.object({
				id: z.string(),
				front: z.string().optional(),
				back: z.string().optional(),
				packId: z.string().optional(),
				sectionSlug: z.string().optional(),
				sort: z.number().optional()
			})
		},
		async ({ id, ...rest }) => done(await send(`/api/v1/lesson-cards/${encodeURIComponent(id)}`, 'PATCH', rest))
	);

	server.registerTool(
		'delete-lesson-card',
		{
			description: 'Hivatalos kártya törlése, szerkesztői jog kell',
			inputSchema: z.object({ id: z.string() })
		},
		async ({ id }) => done(await send(`/api/v1/lesson-cards/${encodeURIComponent(id)}`, 'DELETE'))
	);

	server.registerTool(
		'list-decks',
		{
			description: 'Saját kártyacsomagok listázása',
			inputSchema: z.object({ subjectId: z.string().optional() })
		},
		async (args) => done(await get(`/api/v1/decks${query(args)}`))
	);

	server.registerTool(
		'get-deck',
		{
			description: 'Saját csomag kártyákkal',
			inputSchema: z.object({ id: z.string() })
		},
		async ({ id }) => done(await get(`/api/v1/decks/${encodeURIComponent(id)}`))
	);

	server.registerTool(
		'create-deck',
		{
			description: 'Saját csomag létrehozása, induló kártyákkal is',
			inputSchema: z.object({
				title: z.string(),
				subjectId: z.string().optional(),
				levelId: z.string().optional(),
				materialId: z.string().optional(),
				lessonId: z.string().optional(),
				lessonIds: z.array(z.string()).optional(),
				cards: z.array(z.object({ front: z.string(), back: z.string() })).max(200).optional()
			})
		},
		async (args) => done(await send('/api/v1/decks', 'POST', args))
	);

	server.registerTool(
		'update-deck',
		{
			description: 'Saját csomag szerkesztése',
			inputSchema: z.object({
				id: z.string(),
				title: z.string().optional(),
				subjectId: z.string().optional(),
				levelId: z.string().optional(),
				materialId: z.string().optional(),
				lessonId: z.string().optional(),
				lessonIds: z.array(z.string()).optional()
			})
		},
		async ({ id, ...rest }) => done(await send(`/api/v1/decks/${encodeURIComponent(id)}`, 'PATCH', rest))
	);

	server.registerTool(
		'delete-deck',
		{
			description: 'Saját csomag törlése a kártyáival',
			inputSchema: z.object({ id: z.string() })
		},
		async ({ id }) => done(await send(`/api/v1/decks/${encodeURIComponent(id)}`, 'DELETE'))
	);

	server.registerTool(
		'list-deck-cards',
		{
			description: 'Saját csomag kártyáinak listázása',
			inputSchema: z.object({ deckId: z.string() })
		},
		async ({ deckId }) => done(await get(`/api/v1/deck-cards${query({ deckId })}`))
	);

	server.registerTool(
		'create-deck-card',
		{
			description: 'Új kártya saját csomagba',
			inputSchema: z.object({
				deckId: z.string(),
				front: z.string(),
				back: z.string(),
				sectionSlug: z.string().optional()
			})
		},
		async (args) => done(await send('/api/v1/deck-cards', 'POST', args))
	);

	server.registerTool(
		'update-deck-card',
		{
			description: 'Saját kártya szerkesztése',
			inputSchema: z.object({
				id: z.string(),
				front: z.string().optional(),
				back: z.string().optional(),
				sectionSlug: z.string().optional()
			})
		},
		async ({ id, ...rest }) => done(await send(`/api/v1/deck-cards/${encodeURIComponent(id)}`, 'PATCH', rest))
	);

	server.registerTool(
		'delete-deck-card',
		{
			description: 'Saját kártya törlése',
			inputSchema: z.object({ id: z.string() })
		},
		async ({ id }) => done(await send(`/api/v1/deck-cards/${encodeURIComponent(id)}`, 'DELETE'))
	);

	server.registerTool(
		'get-lesson-progress',
		{
			description: 'Leckehaladás lekérése, egy leckére vagy összesre',
			inputSchema: z.object({ lessonId: z.string().optional() })
		},
		async (args) => done(await get(`/api/v1/progress/lessons${query(args)}`))
	);

	server.registerTool(
		'save-lesson-progress',
		{
			description: 'Lecke készre jelölése vagy pontszám mentése',
			inputSchema: z.object({
				lessonId: z.string(),
				done: z.boolean(),
				score: z.number().optional(),
				total: z.number().optional()
			})
		},
		async (args) => done(await send('/api/v1/progress/lessons', 'POST', args))
	);

	server.registerTool(
		'get-card-progress',
		{
			description: 'Teljes kártyahaladás SM-2 térképe',
			inputSchema: z.object({})
		},
		async () => done(await get('/api/v1/progress/cards'))
	);

	server.registerTool(
		'get-due-cards',
		{
			description: 'Esedékes kártyák egy csomagra, deck, pack vagy lesson azonosítóval',
			inputSchema: z.object({
				deck: z.string().optional(),
				pack: z.string().optional(),
				lesson: z.string().optional()
			})
		},
		async (args) => done(await get(`/api/v1/progress/cards/due${query(args)}`))
	);

	server.registerTool(
		'review-cards',
		{
			description: 'Kártyaosztályzatok mentése SM-2 ütemezéssel',
			inputSchema: z.object({
				results: z.array(z.object({ key: z.string(), known: z.boolean() })).max(500)
			})
		},
		async (args) => done(await send('/api/v1/progress/cards/review', 'POST', args))
	);

	server.registerTool(
		'get-progress-stats',
		{
			description: 'Tanulási összesítő: leckék, kártyák, csomagok, sorozat',
			inputSchema: z.object({})
		},
		async () => done(await get('/api/v1/progress/stats'))
	);

	server.registerTool(
		'list-library',
		{
			description: 'Könyvtár: mentett hivatalos csomagok és saját csomagok',
			inputSchema: z.object({})
		},
		async () => done(await get('/api/v1/library'))
	);

	server.registerTool(
		'save-library',
		{
			description: 'Hivatalos csomag mentése a könyvtárba',
			inputSchema: z.object({ quizId: z.string().describe('Például pack:... vagy cards:...') })
		},
		async (args) => done(await send('/api/v1/library', 'POST', args))
	);

	server.registerTool(
		'remove-library',
		{
			description: 'Csomag törlése a könyvtárból',
			inputSchema: z.object({ quizId: z.string() })
		},
		async (args) => done(await send('/api/v1/library', 'DELETE', args))
	);

	server.registerTool(
		'search',
		{
			description: 'Keresés leckékben és saját csomagokban',
			inputSchema: z.object({
				q: z.string().min(2),
				subjectId: z.string().optional(),
				limit: z.number().int().min(1).max(50).optional()
			})
		},
		async (args) => done(await get(`/api/v1/search${query(args)}`))
	);

	return server;
}

void serveStdio(createServer);
console.error('Leardy MCP szerver fut stdio módban');

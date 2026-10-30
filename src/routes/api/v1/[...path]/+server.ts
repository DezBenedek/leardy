import { json, type RequestHandler } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import { getDb, type PublicUser } from '$lib/server/db';
import {
	canUsePublicApi,
	ensureApiKeysSchema,
	requireApiUser,
	type ApiAuth
} from '$lib/server/api-keys';
import { ensureCurriculumSchema, setDeckLessons, setPackLessons } from '$lib/server/curriculum';
import { requireLevelEditor } from '$lib/server/curriculum-editor';
import { publishedLevelSql } from '$lib/server/curriculum-publication';
import { cardKindForSubject } from '$lib/sm2';
import { storedQuestionOptions } from '$lib/question-types/registry';

/* Leardy Publikus API v1.
   Hitelesítés: Authorization: Bearer ld_... (tanári API kulcs),
   vagy X-Api-Key fejléc, vagy api_key query paraméter.
   Minden végpont tanári vagy admin fiók kulcsát igényli.
   Válaszok: JSON, hiba esetén { error }.
   Dokumentáció: GET /api/v1/ és docs/public-api.md. */

const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
	'access-control-allow-headers': 'authorization, x-api-key, content-type',
	'access-control-max-age': '86400'
};

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', ...CORS, 'cache-control': 'no-store' };

function ok(data: Record<string, unknown>, status = 200) {
	return json(data, { status, headers: JSON_HEADERS });
}

function err(message: string, status = 400) {
	return json({ error: message }, { status, headers: JSON_HEADERS });
}

function newId(prefix: string): string {
	const r = Math.random().toString(36).slice(2, 10);
	return `${prefix}-${Date.now().toString(36)}-${r}`;
}

function intParam(url: URL, name: string, fallback: number, max: number): number {
	const raw = url.searchParams.get(name);
	if (raw === null) return fallback;
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(0, Math.min(max, n));
}

function strParam(url: URL, name: string): string {
	return (url.searchParams.get(name) ?? '').trim();
}

async function readJson(event: Parameters<RequestHandler>[0]): Promise<Record<string, unknown>> {
	try {
		const body = await event.request.json();
		if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
		return {};
	} catch {
		return {};
	}
}

async function auth(event: Parameters<RequestHandler>[0], db: D1Database): Promise<ApiAuth | Response> {
	try {
		await ensureApiKeysSchema(db);
	} catch {
		// séma nélkül is próbálkozunk
	}
	const a = await requireApiUser(event, db);
	if (!a) return err('Hiányzó vagy érvénytelen API kulcs. Használd az Authorization: Bearer ld_... fejlécet.', 401);
	if (!canUsePublicApi(a.user)) return err('A publikus API-hoz tanári fiók kell.', 403);
	return a;
}

async function levelIdForMaterial(db: D1Database, materialId: string): Promise<string | null> {
	const row = await db
		.prepare(`SELECT level_id AS levelId FROM materials WHERE id = ?`)
		.bind(materialId)
		.first<{ levelId: string }>()
		.catch(() => null);
	return row?.levelId ?? null;
}

async function levelIdForLesson(db: D1Database, lessonId: string): Promise<string | null> {
	const row = await db
		.prepare(
			`SELECT l.id AS levelId FROM lessons le
			 JOIN materials m ON m.id = le.material_id
			 JOIN levels l ON l.id = m.level_id WHERE le.id = ?`
		)
		.bind(lessonId)
		.first<{ levelId: string }>()
		.catch(() => null);
	return row?.levelId ?? null;
}

async function levelIdForQuiz(db: D1Database, quizId: string): Promise<string | null> {
	const row = await db
		.prepare(
			`SELECT l.id AS levelId FROM quizzes q
			 JOIN lessons le ON le.id = q.lesson_id
			 JOIN materials m ON m.id = le.material_id
			 JOIN levels l ON l.id = m.level_id WHERE q.id = ?`
		)
		.bind(quizId)
		.first<{ levelId: string }>()
		.catch(() => null);
	return row?.levelId ?? null;
}

async function levelIdForPack(db: D1Database, packId: string): Promise<{ levelId: string; lessonId: string } | null> {
	const row = await db
		.prepare(
			`SELECT l.id AS levelId, le.id AS lessonId FROM lesson_card_packs p
			 JOIN lessons le ON le.id = p.lesson_id
			 JOIN materials m ON m.id = le.material_id
			 JOIN levels l ON l.id = m.level_id WHERE p.id = ?`
		)
		.bind(packId)
		.first<{ levelId: string; lessonId: string }>()
		.catch(() => null);
	return row ?? null;
}

function optionsToJson(type: string, body: Record<string, unknown>): string {
	try {
		const fields = {
			options: (body.options ?? body.answers ?? []) as string[],
			pairs: (body.pairs ?? []) as never,
			correct_answer: String(body.correctAnswer ?? body.correct_answer ?? ''),
			settings: body.settings as never
		};
		return JSON.stringify(storedQuestionOptions(type, fields));
	} catch {
		const raw = body.options ?? body.answers ?? [];
		try {
			return JSON.stringify(raw);
		} catch {
			return '[]';
		}
	}
}

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

	/* Tantárgyak */
	if (head === 'subjects' && method === 'GET' && !second) {
		const res = await db
			.prepare(
				`SELECT id, title, COALESCE(icon, 'book') AS icon,
					COALESCE(level_label, 'Tananyag') AS levelLabel, COALESCE(sort, 0) AS sort
				 FROM subjects ORDER BY sort, title LIMIT 200`
			)
			.all<{ id: string; title: string; icon: string; levelLabel: string; sort: number }>();
		return ok({ subjects: res.results ?? [] });
	}
	if (head === 'subjects' && method === 'GET' && second) {
		const subject = await db
			.prepare(
				`SELECT id, title, COALESCE(icon, 'book') AS icon,
					COALESCE(level_label, 'Tananyag') AS levelLabel, COALESCE(sort, 0) AS sort
				 FROM subjects WHERE id = ?`
			)
			.bind(second)
			.first();
		if (!subject) return err('Nincs ilyen tantárgy.', 404);
		if (strParam(url, 'include') === 'tree') {
			const levelsRes = await db
				.prepare(
					`SELECT id, title, COALESCE(sort, 0) AS sort FROM levels l
					 WHERE subject_id = ? AND ${publishedLevelSql('l')} ORDER BY sort, title LIMIT 200`
				)
				.bind(second)
				.all();
			const levels = (levelsRes.results ?? []) as { id: string; title: string; sort: number }[];
			let materials: unknown[] = [];
			let lessons: unknown[] = [];
			if (levels.length > 0) {
				const ids = levels.map((l) => l.id);
				const matRes = await db
					.prepare(`SELECT id, level_id AS levelId, title, COALESCE(sort, 0) AS sort FROM materials WHERE level_id IN (${ids.map(() => '?').join(', ')}) ORDER BY sort, title LIMIT 500`)
					.bind(...ids)
					.all();
				materials = matRes.results ?? [];
				const matIds = (materials as { id: string }[]).map((m) => m.id);
				if (matIds.length > 0) {
					const lesRes = await db
						.prepare(`SELECT id, material_id AS materialId, title, COALESCE(sort, 0) AS sort FROM lessons WHERE material_id IN (${matIds.map(() => '?').join(', ')}) ORDER BY sort, title LIMIT 1000`)
						.bind(...matIds)
						.all();
					lessons = lesRes.results ?? [];
				}
			}
			return ok({ subject, levels, materials, lessons });
		}
		return ok({ subject });
	}

	/* Szintek */
	if (head === 'levels' && method === 'GET' && !second) {
		const subjectId = strParam(url, 'subjectId') || strParam(url, 'subject');
		const cond = subjectId ? 'WHERE l.subject_id = ?' : '';
		const args = subjectId ? [subjectId] : [];
		const res = await db
			.prepare(
				`SELECT l.id, l.subject_id AS subjectId, l.title, COALESCE(l.sort, 0) AS sort,
					COALESCE(ls.published, 1) AS published
				 FROM levels l LEFT JOIN level_settings ls ON ls.level_id = l.id
				 ${cond} ORDER BY l.sort, l.title LIMIT 200`
			)
			.bind(...args)
			.all();
		return ok({ levels: res.results ?? [] });
	}
	if (head === 'levels' && method === 'GET' && second) {
		const row = await db
			.prepare(
				`SELECT l.id, l.subject_id AS subjectId, l.title, COALESCE(l.sort, 0) AS sort,
					COALESCE(ls.published, 1) AS published
				 FROM levels l LEFT JOIN level_settings ls ON ls.level_id = l.id WHERE l.id = ?`
			)
			.bind(second)
			.first();
		if (!row) return err('Nincs ilyen szint.', 404);
		return ok({ level: row });
	}

	/* Témakörök */
	if (head === 'materials' && method === 'GET' && !second) {
		const levelId = strParam(url, 'levelId');
		const cond = levelId ? 'WHERE m.level_id = ?' : '';
		const args = levelId ? [levelId] : [];
		const res = await db
			.prepare(
				`SELECT m.id, m.level_id AS levelId, m.title, COALESCE(m.sort, 0) AS sort
				 FROM materials m ${cond} ORDER BY m.sort, m.title LIMIT 500`
			)
			.bind(...args)
			.all();
		return ok({ materials: res.results ?? [] });
	}
	if (head === 'materials' && method === 'GET' && second) {
		const row = await db
			.prepare(`SELECT id, level_id AS levelId, title, COALESCE(sort, 0) AS sort FROM materials WHERE id = ?`)
			.bind(second)
			.first();
		if (!row) return err('Nincs ilyen témakör.', 404);
		return ok({ material: row });
	}

	/* Leckék */
	if (head === 'lessons' && method === 'GET' && !second) {
		const materialId = strParam(url, 'materialId');
		const subjectId = strParam(url, 'subjectId') || strParam(url, 'subject');
		const search = strParam(url, 'search') || strParam(url, 'q');
		const limit = intParam(url, 'limit', 50, 200);
		const offset = intParam(url, 'offset', 0, 10000);
		const conds: string[] = [];
		const args: string[] = [];
		if (materialId) {
			conds.push('le.material_id = ?');
			args.push(materialId);
		}
		if (subjectId) {
			conds.push('l.subject_id = ?');
			args.push(subjectId);
		}
		if (search) {
			conds.push('(le.title LIKE ? OR le.body_md LIKE ?)');
			args.push(`%${search}%`, `%${search}%`);
		}
		const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
		const res = await db
			.prepare(
				`SELECT le.id, le.material_id AS materialId, le.title, COALESCE(le.sort, 0) AS sort,
					m.title AS materialTitle, l.title AS levelTitle, s.title AS subjectTitle,
					s.id AS subjectId, l.id AS levelId
				 FROM lessons le
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
				 JOIN subjects s ON s.id = l.subject_id
				 ${where} ORDER BY s.sort, l.sort, m.sort, le.sort, le.title LIMIT ? OFFSET ?`
			)
			.bind(...args, limit, offset)
			.all();
		return ok({ lessons: res.results ?? [], limit, offset });
	}
	if (head === 'lessons' && method === 'POST' && !second) {
		const body = await readJson(event);
		const materialId = String(body.materialId ?? body.material_id ?? '').trim();
		const title = String(body.title ?? '').trim();
		if (!materialId) return err('Hiányzik a materialId.', 400);
		if (!title) return err('Add meg a lecke címét.', 400);
		const levelId = await levelIdForMaterial(db, materialId);
		if (!levelId) return err('Nincs ilyen témakör.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		const bodyMd = String(body.bodyMd ?? body.body_md ?? '');
		const sort = Number.isFinite(Number(body.sort)) ? Number(body.sort) : 0;
		const id = newId('les');
		await ensureCurriculumSchema(db);
		await db
			.prepare(`INSERT INTO lessons (id, material_id, title, body_md, sort) VALUES (?, ?, ?, ?, ?)`)
			.bind(id, materialId, title.slice(0, 200), bodyMd.slice(0, 200000), sort)
			.run();
		return ok({ ok: true, id, lesson: { id, materialId, title, sort } }, 201);
	}
	if (head === 'lessons' && second) {
		if (method === 'GET') {
			const include = strParam(url, 'include');
			const row = await db
				.prepare(
					`SELECT le.id, le.material_id AS materialId, le.title,
						COALESCE(le.body_md, '') AS bodyMd, COALESCE(le.sort, 0) AS sort,
						m.title AS materialTitle, l.title AS levelTitle, s.title AS subjectTitle,
						s.id AS subjectId, l.id AS levelId
					 FROM lessons le
					 JOIN materials m ON m.id = le.material_id
					 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
					 JOIN subjects s ON s.id = l.subject_id
					 WHERE le.id = ?`
				)
				.bind(second)
				.first();
			if (!row) return err('Nincs ilyen lecke.', 404);
			const out: Record<string, unknown> = { lesson: row };
			if (include.includes('quiz') || include === 'all') {
				const qRes = await db
					.prepare(`SELECT id, title, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM quizzes WHERE lesson_id = ? ORDER BY sort, title LIMIT 100`)
					.bind(second)
					.all();
				const quizzes = (qRes.results ?? []) as { id: string }[];
				let questions: unknown[] = [];
				if (quizzes.length > 0) {
					const qq = await db
						.prepare(`SELECT id, quiz_id AS quizId, question_text AS questionText, COALESCE(type, 'choice') AS type, COALESCE(options_json, '[]') AS optionsJson, COALESCE(correct_answer, '') AS correctAnswer, COALESCE(section_slug, '') AS sectionSlug FROM quiz_questions WHERE quiz_id IN (${quizzes.map(() => '?').join(', ')}) ORDER BY sort, id LIMIT 1000`)
						.bind(...quizzes.map((q) => q.id))
						.all();
					questions = qq.results ?? [];
				}
				out.quizzes = quizzes;
				out.questions = questions;
			}
			if (include.includes('card') || include === 'all') {
				const cRes = await db
					.prepare(`SELECT id, COALESCE(pack_id, '') AS packId, COALESCE(section_slug, '') AS sectionSlug, COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(sort, 0) AS sort FROM lesson_cards WHERE lesson_id = ? ORDER BY sort, id LIMIT 1000`)
					.bind(second)
					.all();
				out.lessonCards = cRes.results ?? [];
				const pRes = await db
					.prepare(`SELECT id, title, COALESCE(card_kind, 'word') AS cardKind, COALESCE(sort, 0) AS sort FROM lesson_card_packs WHERE lesson_id = ? ORDER BY sort, title LIMIT 100`)
					.bind(second)
					.all();
				out.cardPacks = pRes.results ?? [];
			}
			return ok(out);
		}
		if (method === 'PATCH') {
			const body = await readJson(event);
			const levelId = await levelIdForLesson(db, second);
			if (!levelId) return err('Nincs ilyen lecke.', 404);
			try {
				await requireLevelEditor(db, user, levelId);
			} catch {
				return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
			}
			const sets: string[] = [];
			const args: (string | number)[] = [];
			if (body.title !== undefined) {
				const t = String(body.title).trim();
				if (!t) return err('A cím nem lehet üres.', 400);
				sets.push('title = ?');
				args.push(t.slice(0, 200));
			}
			const bodyMd = body.bodyMd ?? body.body_md;
			if (bodyMd !== undefined) {
				sets.push('body_md = ?');
				args.push(String(bodyMd).slice(0, 200000));
			}
			if (body.sort !== undefined) {
				sets.push('sort = ?');
				args.push(Number(body.sort) || 0);
			}
			if (body.materialId !== undefined || body.material_id !== undefined) {
				const nm = String(body.materialId ?? body.material_id ?? '').trim();
				const nl = nm ? await levelIdForMaterial(db, nm) : null;
				if (!nm || !nl) return err('Nincs ilyen céltémakör.', 404);
				try {
					await requireLevelEditor(db, user, nl);
				} catch {
					return err('A céltananyaghoz nincs jogosultságod.', 403);
				}
				sets.push('material_id = ?');
				args.push(nm);
			}
			if (sets.length === 0) return err('Nincs módosítás.', 400);
			await db.prepare(`UPDATE lessons SET ${sets.join(', ')} WHERE id = ?`).bind(...args, second).run();
			return ok({ ok: true });
		}
		if (method === 'DELETE') {
			const levelId = await levelIdForLesson(db, second);
			if (!levelId) return err('Nincs ilyen lecke.', 404);
			try {
				await requireLevelEditor(db, user, levelId);
			} catch {
				return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
			}
			await db.batch([
				db.prepare(`DELETE FROM quiz_questions WHERE quiz_id IN (SELECT id FROM quizzes WHERE lesson_id = ?)`).bind(second),
				db.prepare(`DELETE FROM quizzes WHERE lesson_id = ?`).bind(second),
				db.prepare(`DELETE FROM lesson_cards WHERE lesson_id = ?`).bind(second),
				db.prepare(`DELETE FROM lessons WHERE id = ?`).bind(second)
			]);
			return ok({ ok: true });
		}
	}

	/* Kvízek */
	if (head === 'quizzes' && method === 'GET' && !second) {
		const lessonId = strParam(url, 'lessonId') || strParam(url, 'lesson_id');
		const subjectId = strParam(url, 'subjectId');
		const limit = intParam(url, 'limit', 50, 200);
		const offset = intParam(url, 'offset', 0, 10000);
		if (lessonId) {
			const res = await db
				.prepare(`SELECT id, lesson_id AS lessonId, title, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM quizzes WHERE lesson_id = ? ORDER BY sort, title LIMIT ? OFFSET ?`)
				.bind(lessonId, limit, offset)
				.all();
			const quizzes = (res.results ?? []) as { id: string }[];
			let questions: unknown[] = [];
			if (strParam(url, 'include') === 'questions' && quizzes.length > 0) {
				const qq = await db
					.prepare(`SELECT id, quiz_id AS quizId, question_text AS questionText, COALESCE(type, 'choice') AS type, COALESCE(options_json, '[]') AS optionsJson, COALESCE(correct_answer, '') AS correctAnswer, COALESCE(section_slug, '') AS sectionSlug FROM quiz_questions WHERE quiz_id IN (${quizzes.map(() => '?').join(', ')}) ORDER BY sort, id LIMIT 1000`)
					.bind(...quizzes.map((q) => q.id))
					.all();
				questions = qq.results ?? [];
				return ok({ quizzes, questions, limit, offset });
			}
			return ok({ quizzes, limit, offset });
		}
		const conds: string[] = [];
		const args: string[] = [];
		if (subjectId) {
			conds.push('s.id = ?');
			args.push(subjectId);
		}
		const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
		const res = await db
			.prepare(
				`SELECT q.id, q.lesson_id AS lessonId, q.title, COALESCE(q.section_slug, '') AS sectionSlug,
					le.title AS lessonTitle, s.title AS subjectTitle, s.id AS subjectId
				 FROM quizzes q
				 JOIN lessons le ON le.id = q.lesson_id
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
				 JOIN subjects s ON s.id = l.subject_id
				 ${where} ORDER BY s.sort, le.sort, q.sort LIMIT ? OFFSET ?`
			)
			.bind(...args, limit, offset)
			.all();
		return ok({ quizzes: res.results ?? [], limit, offset });
	}
	if (head === 'quizzes' && method === 'POST' && !second) {
		const body = await readJson(event);
		const lessonId = String(body.lessonId ?? body.lesson_id ?? '').trim();
		const title = String(body.title ?? '').trim();
		if (!lessonId) return err('Hiányzik a lessonId.', 400);
		if (!title) return err('Add meg a kvíz címét.', 400);
		const levelId = await levelIdForLesson(db, lessonId);
		if (!levelId) return err('Nincs ilyen lecke.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		const id = newId('quiz');
		await db
			.prepare(`INSERT INTO quizzes (id, lesson_id, section_slug, title, sort) VALUES (?, ?, ?, ?, ?)`)
			.bind(id, lessonId, String(body.sectionSlug ?? body.section_slug ?? '').trim().slice(0, 80), title.slice(0, 200), Number(body.sort) || 0)
			.run();
		return ok({ ok: true, id }, 201);
	}
	if (head === 'quizzes' && second) {
		if (method === 'GET') {
			const row = await db
				.prepare(`SELECT id, lesson_id AS lessonId, title, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM quizzes WHERE id = ?`)
				.bind(second)
				.first();
			if (!row) return err('Nincs ilyen kvíz.', 404);
			const qq = await db
				.prepare(`SELECT id, quiz_id AS quizId, question_text AS questionText, COALESCE(type, 'choice') AS type, COALESCE(options_json, '[]') AS optionsJson, COALESCE(correct_answer, '') AS correctAnswer, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM quiz_questions WHERE quiz_id = ? ORDER BY sort, id LIMIT 500`)
				.bind(second)
				.all();
			return ok({ quiz: row, questions: qq.results ?? [] });
		}
		const levelId = await levelIdForQuiz(db, second);
		if (!levelId) return err('Nincs ilyen kvíz.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		if (method === 'PATCH') {
			const body = await readJson(event);
			const sets: string[] = [];
			const args: (string | number)[] = [];
			if (body.title !== undefined) {
				const t = String(body.title).trim();
				if (!t) return err('A cím nem lehet üres.', 400);
				sets.push('title = ?');
				args.push(t.slice(0, 200));
			}
			if (body.sectionSlug !== undefined || body.section_slug !== undefined) {
				sets.push('section_slug = ?');
				args.push(String(body.sectionSlug ?? body.section_slug ?? '').trim().slice(0, 80));
			}
			if (body.sort !== undefined) {
				sets.push('sort = ?');
				args.push(Number(body.sort) || 0);
			}
			if (body.lessonId !== undefined || body.lesson_id !== undefined) {
				const nl = String(body.lessonId ?? body.lesson_id ?? '').trim();
				const nlvl = nl ? await levelIdForLesson(db, nl) : null;
				if (!nl || !nlvl) return err('Nincs ilyen céllecke.', 404);
				try {
					await requireLevelEditor(db, user, nlvl);
				} catch {
					return err('A célleckéhez nincs jogosultságod.', 403);
				}
				sets.push('lesson_id = ?');
				args.push(nl);
			}
			if (sets.length === 0) return err('Nincs módosítás.', 400);
			await db.prepare(`UPDATE quizzes SET ${sets.join(', ')} WHERE id = ?`).bind(...args, second).run();
			return ok({ ok: true });
		}
		if (method === 'DELETE') {
			await db.batch([
				db.prepare(`DELETE FROM quiz_questions WHERE quiz_id = ?`).bind(second),
				db.prepare(`DELETE FROM quizzes WHERE id = ?`).bind(second)
			]);
			return ok({ ok: true });
		}
	}

	/* Kvízkérdések */
	if (head === 'quiz-questions' && method === 'GET' && !second) {
		const quizId = strParam(url, 'quizId') || strParam(url, 'quiz_id');
		if (!quizId) return err('Hiányzik a quizId.', 400);
		const res = await db
			.prepare(`SELECT id, quiz_id AS quizId, question_text AS questionText, COALESCE(type, 'choice') AS type, COALESCE(options_json, '[]') AS optionsJson, COALESCE(correct_answer, '') AS correctAnswer, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM quiz_questions WHERE quiz_id = ? ORDER BY sort, id LIMIT 500`)
			.bind(quizId)
			.all();
		return ok({ questions: res.results ?? [] });
	}
	if (head === 'quiz-questions' && method === 'POST' && !second) {
		const body = await readJson(event);
		const quizId = String(body.quizId ?? body.quiz_id ?? '').trim();
		const questionText = String(body.questionText ?? body.question_text ?? '').trim();
		if (!quizId) return err('Hiányzik a quizId.', 400);
		if (!questionText) return err('Add meg a kérdés szövegét.', 400);
		const levelId = await levelIdForQuiz(db, quizId);
		if (!levelId) return err('Nincs ilyen kvíz.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		const type = String(body.type ?? 'choice').trim() || 'choice';
		const optionsJson = typeof body.optionsJson === 'string' ? body.optionsJson : optionsToJson(type, body);
		const id = newId('qq');
		await db
			.prepare(`INSERT INTO quiz_questions (id, quiz_id, question_text, type, options_json, correct_answer, sort, section_slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
			.bind(id, quizId, questionText.slice(0, 5000), type.slice(0, 30), optionsJson.slice(0, 50000), String(body.correctAnswer ?? body.correct_answer ?? '').slice(0, 5000), Number(body.sort) || 0, String(body.sectionSlug ?? body.section_slug ?? '').trim().slice(0, 80))
			.run();
		return ok({ ok: true, id }, 201);
	}
	if (head === 'quiz-questions' && second) {
		if (method === 'GET') {
			const row = await db
				.prepare(`SELECT id, quiz_id AS quizId, question_text AS questionText, COALESCE(type, 'choice') AS type, COALESCE(options_json, '[]') AS optionsJson, COALESCE(correct_answer, '') AS correctAnswer, COALESCE(section_slug, '') AS sectionSlug FROM quiz_questions WHERE id = ?`)
				.bind(second)
				.first();
			if (!row) return err('Nincs ilyen kérdés.', 404);
			return ok({ question: row });
		}
		const qrow = await db.prepare(`SELECT quiz_id AS quizId FROM quiz_questions WHERE id = ?`).bind(second).first<{ quizId: string }>().catch(() => null);
		if (!qrow) return err('Nincs ilyen kérdés.', 404);
		const levelId = await levelIdForQuiz(db, qrow.quizId);
		if (!levelId) return err('Nincs ilyen kvíz.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		if (method === 'PATCH') {
			const body = await readJson(event);
			const sets: string[] = [];
			const args: (string | number)[] = [];
			if (body.questionText !== undefined || body.question_text !== undefined) {
				const t = String(body.questionText ?? body.question_text ?? '').trim();
				if (!t) return err('A kérdés szövege nem lehet üres.', 400);
				sets.push('question_text = ?');
				args.push(t.slice(0, 5000));
			}
			if (body.type !== undefined) {
				sets.push('type = ?');
				args.push(String(body.type).slice(0, 30));
			}
			if (body.options !== undefined || body.answers !== undefined || body.optionsJson !== undefined || body.settings !== undefined || body.pairs !== undefined) {
				const type = String(body.type ?? (await db.prepare(`SELECT type FROM quiz_questions WHERE id = ?`).bind(second).first<{ type: string }>().then((r) => r?.type).catch(() => 'choice')) ?? 'choice');
				const oj = typeof body.optionsJson === 'string' ? body.optionsJson : optionsToJson(type, body);
				sets.push('options_json = ?');
				args.push(oj.slice(0, 50000));
			}
			if (body.correctAnswer !== undefined || body.correct_answer !== undefined) {
				sets.push('correct_answer = ?');
				args.push(String(body.correctAnswer ?? body.correct_answer ?? '').slice(0, 5000));
			}
			if (body.sectionSlug !== undefined || body.section_slug !== undefined) {
				sets.push('section_slug = ?');
				args.push(String(body.sectionSlug ?? body.section_slug ?? '').trim().slice(0, 80));
			}
			if (body.sort !== undefined) {
				sets.push('sort = ?');
				args.push(Number(body.sort) || 0);
			}
			if (sets.length === 0) return err('Nincs módosítás.', 400);
			await db.prepare(`UPDATE quiz_questions SET ${sets.join(', ')} WHERE id = ?`).bind(...args, second).run();
			return ok({ ok: true });
		}
		if (method === 'DELETE') {
			await db.prepare(`DELETE FROM quiz_questions WHERE id = ?`).bind(second).run();
			return ok({ ok: true });
		}
	}

	/* Hivatalos kártyacsomagok */
	if (head === 'card-packs' && method === 'GET' && !second) {
		const subjectId = strParam(url, 'subjectId') || strParam(url, 'subject');
		const lessonId = strParam(url, 'lessonId');
		const limit = intParam(url, 'limit', 50, 200);
		const offset = intParam(url, 'offset', 0, 10000);
		const conds: string[] = [];
		const args: (string | number)[] = [];
		if (lessonId) {
			conds.push('p.lesson_id = ?');
			args.push(lessonId);
		}
		if (subjectId) {
			conds.push('s.id = ?');
			args.push(subjectId);
		}
		const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
		const res = await db
			.prepare(
				`SELECT p.id, p.title, COALESCE(p.card_kind, 'word') AS cardKind,
					p.lesson_id AS lessonId, le.title AS lessonTitle,
					s.id AS subjectId, s.title AS subjectTitle, l.title AS levelTitle,
					COALESCE(p.sort, 0) AS sort,
					(SELECT COUNT(*) FROM lesson_cards c WHERE c.pack_id = p.id) AS cardCount
				 FROM lesson_card_packs p
				 JOIN lessons le ON le.id = p.lesson_id
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
				 JOIN subjects s ON s.id = l.subject_id
				 ${where} ORDER BY s.sort, p.sort, p.title LIMIT ? OFFSET ?`
			)
			.bind(...args, limit, offset)
			.all();
		return ok({ packs: res.results ?? [], limit, offset });
	}
	if (head === 'card-packs' && method === 'POST' && !second) {
		const body = await readJson(event);
		const lessonId = String(body.lessonId ?? body.lesson_id ?? '').trim();
		const title = String(body.title ?? '').trim();
		if (!lessonId) return err('Hiányzik a lessonId.', 400);
		if (!title) return err('Add meg a csomag címét.', 400);
		const levelId = await levelIdForLesson(db, lessonId);
		if (!levelId) return err('Nincs ilyen lecke.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		const id = newId('pack');
		await db
			.prepare(`INSERT INTO lesson_card_packs (id, lesson_id, title, card_kind, sort) VALUES (?, ?, ?, ?, ?)`)
			.bind(id, lessonId, title.slice(0, 200), body.cardKind === 'study' ? 'study' : 'word', Number(body.sort) || 0)
			.run();
		const extraLessons = Array.isArray(body.lessonIds) ? body.lessonIds.map((s) => String(s).trim()).filter(Boolean).slice(0, 50) : [];
		if (extraLessons.length > 0) {
			try {
				await setPackLessons(db, id, [lessonId, ...extraLessons]);
			} catch {
				// kapcsoló nem kritikus
			}
		}
		return ok({ ok: true, id }, 201);
	}
	if (head === 'card-packs' && second) {
		if (method === 'GET') {
			const row = await db
				.prepare(`SELECT p.id, p.title, COALESCE(p.card_kind, 'word') AS cardKind, p.lesson_id AS lessonId, le.title AS lessonTitle, COALESCE(p.sort, 0) AS sort FROM lesson_card_packs p JOIN lessons le ON le.id = p.lesson_id WHERE p.id = ?`)
				.bind(second)
				.first();
			if (!row) return err('Nincs ilyen csomag.', 404);
			const cards = await db
				.prepare(`SELECT id, COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM lesson_cards WHERE pack_id = ? ORDER BY sort, id LIMIT 1000`)
				.bind(second)
				.all();
			return ok({ pack: row, cards: cards.results ?? [] });
		}
		const info = await levelIdForPack(db, second);
		if (!info) return err('Nincs ilyen csomag.', 404);
		try {
			await requireLevelEditor(db, user, info.levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		if (method === 'PATCH') {
			const body = await readJson(event);
			const sets: string[] = [];
			const args: (string | number)[] = [];
			if (body.title !== undefined) {
				const t = String(body.title).trim();
				if (!t) return err('A cím nem lehet üres.', 400);
				sets.push('title = ?');
				args.push(t.slice(0, 200));
			}
			if (body.cardKind !== undefined) {
				sets.push('card_kind = ?');
				args.push(body.cardKind === 'study' ? 'study' : 'word');
			}
			if (body.sort !== undefined) {
				sets.push('sort = ?');
				args.push(Number(body.sort) || 0);
			}
			if (body.lessonId !== undefined || body.lesson_id !== undefined) {
				const nl = String(body.lessonId ?? body.lesson_id ?? '').trim();
				const nlvl = nl ? await levelIdForLesson(db, nl) : null;
				if (!nl || !nlvl) return err('Nincs ilyen céllecke.', 404);
				sets.push('lesson_id = ?');
				args.push(nl);
			}
			if (sets.length === 0 && body.lessonIds === undefined) return err('Nincs módosítás.', 400);
			if (sets.length > 0) {
				await db.prepare(`UPDATE lesson_card_packs SET ${sets.join(', ')} WHERE id = ?`).bind(...args, second).run();
			}
			if (body.lessonIds !== undefined) {
				const ids = Array.isArray(body.lessonIds) ? body.lessonIds.map((s) => String(s).trim()).filter(Boolean).slice(0, 50) : [];
				try {
					await setPackLessons(db, second, ids);
				} catch {
					// nem kritikus
				}
			}
			return ok({ ok: true });
		}
		if (method === 'DELETE') {
			await db.batch([
				db.prepare(`UPDATE lesson_cards SET pack_id = NULL WHERE pack_id = ?`).bind(second),
				db.prepare(`DELETE FROM lesson_card_packs WHERE id = ?`).bind(second)
			]);
			return ok({ ok: true });
		}
	}

	/* Hivatalos kártyák (leckekártyák) */
	if (head === 'lesson-cards' && method === 'GET' && !second) {
		const lessonId = strParam(url, 'lessonId');
		const packId = strParam(url, 'packId');
		const limit = intParam(url, 'limit', 100, 1000);
		const offset = intParam(url, 'offset', 0, 10000);
		const conds: string[] = [];
		const args: (string | number)[] = [];
		if (lessonId) {
			conds.push('lc.lesson_id = ?');
			args.push(lessonId);
		}
		if (packId) {
			conds.push('lc.pack_id = ?');
			args.push(packId);
		}
		if (conds.length === 0) return err('Add meg a lessonId vagy packId paramétert.', 400);
		const res = await db
			.prepare(`SELECT id, lesson_id AS lessonId, COALESCE(pack_id, '') AS packId, COALESCE(section_slug, '') AS sectionSlug, COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(sort, 0) AS sort FROM lesson_cards lc WHERE ${conds.join(' AND ')} ORDER BY sort, id LIMIT ? OFFSET ?`)
			.bind(...args, limit, offset)
			.all();
		return ok({ cards: res.results ?? [], limit, offset });
	}
	if (head === 'lesson-cards' && method === 'POST' && !second) {
		const body = await readJson(event);
		const lessonId = String(body.lessonId ?? body.lesson_id ?? '').trim();
		const front = String(body.front ?? '').trim();
		const back = String(body.back ?? '').trim();
		if (!lessonId) return err('Hiányzik a lessonId.', 400);
		if (!front || !back) return err('Töltsd ki a kártya mindkét oldalát.', 400);
		const levelId = await levelIdForLesson(db, lessonId);
		if (!levelId) return err('Nincs ilyen lecke.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		const packId = String(body.packId ?? body.pack_id ?? '').trim() || null;
		if (packId) {
			const p = await db.prepare(`SELECT id FROM lesson_card_packs WHERE id = ?`).bind(packId).first().catch(() => null);
			if (!p) return err('Nincs ilyen csomag.', 404);
		}
		const id = newId('lc');
		const maxSort = await db.prepare(`SELECT COALESCE(MAX(sort), -1) AS m FROM lesson_cards WHERE lesson_id = ?`).bind(lessonId).first<{ m: number }>().catch(() => ({ m: -1 }));
		await db
			.prepare(`INSERT INTO lesson_cards (id, lesson_id, section_slug, front, back, sort, pack_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
			.bind(id, lessonId, String(body.sectionSlug ?? body.section_slug ?? '').trim().slice(0, 80), front.slice(0, 5000), back.slice(0, 5000), (maxSort?.m ?? -1) + 1, packId)
			.run();
		return ok({ ok: true, id }, 201);
	}
	if (head === 'lesson-cards' && second) {
		const cardRow = await db.prepare(`SELECT id, lesson_id AS lessonId FROM lesson_cards WHERE id = ?`).bind(second).first<{ id: string; lessonId: string }>().catch(() => null);
		if (!cardRow) return err('Nincs ilyen kártya.', 404);
		if (method === 'GET') {
			const row = await db.prepare(`SELECT id, lesson_id AS lessonId, COALESCE(pack_id, '') AS packId, COALESCE(section_slug, '') AS sectionSlug, COALESCE(front, '') AS front, COALESCE(back, '') AS back FROM lesson_cards WHERE id = ?`).bind(second).first();
			return ok({ card: row });
		}
		const levelId = await levelIdForLesson(db, cardRow.lessonId);
		if (!levelId) return err('Nincs ilyen lecke.', 404);
		try {
			await requireLevelEditor(db, user, levelId);
		} catch {
			return err('Ehhez a tananyaghoz nincs szerkesztési jogosultságod.', 403);
		}
		if (method === 'PATCH') {
			const body = await readJson(event);
			const sets: string[] = [];
			const args: (string | number | null)[] = [];
			if (body.front !== undefined) {
				const f = String(body.front).trim();
				if (!f) return err('Az előlap nem lehet üres.', 400);
				sets.push('front = ?');
				args.push(f.slice(0, 5000));
			}
			if (body.back !== undefined) {
				const b = String(body.back).trim();
				if (!b) return err('A hátlap nem lehet üres.', 400);
				sets.push('back = ?');
				args.push(b.slice(0, 5000));
			}
			if (body.sectionSlug !== undefined || body.section_slug !== undefined) {
				sets.push('section_slug = ?');
				args.push(String(body.sectionSlug ?? body.section_slug ?? '').trim().slice(0, 80));
			}
			if (body.packId !== undefined || body.pack_id !== undefined) {
				const p = String(body.packId ?? body.pack_id ?? '').trim() || null;
				sets.push('pack_id = ?');
				args.push(p);
			}
			if (body.sort !== undefined) {
				sets.push('sort = ?');
				args.push(Number(body.sort) || 0);
			}
			if (sets.length === 0) return err('Nincs módosítás.', 400);
			await db.prepare(`UPDATE lesson_cards SET ${sets.join(', ')} WHERE id = ?`).bind(...args, second).run();
			return ok({ ok: true });
		}
		if (method === 'DELETE') {
			await db.prepare(`DELETE FROM lesson_cards WHERE id = ?`).bind(second).run();
			return ok({ ok: true });
		}
	}

	/* Saját csomagok */
	if (head === 'decks' && method === 'GET' && !second) {
		const subjectId = strParam(url, 'subjectId');
		const limit = intParam(url, 'limit', 100, 500);
		const conds = ['d.user_id = ?'];
		const args: (string | number)[] = [user.id];
		if (subjectId) {
			conds.push('d.subject_id = ?');
			args.push(subjectId);
		}
		const res = await db
			.prepare(
				`SELECT d.id, d.title, COALESCE(d.kind, 'cards') AS kind,
					COALESCE(d.card_kind, 'word') AS cardKind,
					d.subject_id AS subjectId, d.level_id AS levelId,
					d.material_id AS materialId, d.lesson_id AS lessonId,
					COALESCE(d.created_at, 0) AS createdAt,
					(SELECT COUNT(*) FROM deck_cards c WHERE c.deck_id = d.id) AS cardCount
				 FROM decks d WHERE ${conds.join(' AND ')} ORDER BY d.created_at DESC LIMIT ?`
			)
			.bind(...args, limit)
			.all();
		return ok({ decks: res.results ?? [] });
	}
	if (head === 'decks' && method === 'POST' && !second) {
		const body = await readJson(event);
		const title = String(body.title ?? '').trim();
		if (!title) return err('Add meg a csomag címét.', 400);
		const cards = Array.isArray(body.cards) ? body.cards.slice(0, 200) : [];
		const cleanCards = cards
			.map((c) => {
				const o = c as Record<string, unknown>;
				return { front: String(o.front ?? '').trim(), back: String(o.back ?? '').trim() };
			})
			.filter((c) => c.front && c.back);
		let cardKind: 'word' | 'study' = 'word';
		const subjectId = String(body.subjectId ?? body.subject_id ?? '').trim() || null;
		if (subjectId) {
			const subj = await db.prepare(`SELECT title, COALESCE(icon, 'book') AS icon FROM subjects WHERE id = ?`).bind(subjectId).first<{ title: string; icon: string }>().catch(() => null);
			cardKind = cardKindForSubject(subj?.title ?? '', subj?.icon ?? 'book', subjectId);
		}
		const id = newId('deck');
		const now = Math.floor(Date.now() / 1000);
		const lessonIds = Array.isArray(body.lessonIds)
			? [...new Set(body.lessonIds.map((s) => String(s).trim()).filter(Boolean))].slice(0, 50)
			: body.lessonId || body.lesson_id
				? [String(body.lessonId ?? body.lesson_id)]
				: [];
		const isPublic = body.isPublic === true || body.is_public === 1 || body.is_public === true ? 1 : 0;
		await ensureCurriculumSchema(db);
		const batch: { run: () => Promise<unknown> }[] = [];
		batch.push(
			db.prepare(`INSERT INTO decks (id, user_id, title, kind, card_kind, subject_id, level_id, material_id, lesson_id, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
				.bind(id, user.id, title.slice(0, 200), 'cards', cardKind, subjectId, String(body.levelId ?? body.level_id ?? '').trim() || null, String(body.materialId ?? body.material_id ?? '').trim() || null, lessonIds[0] ?? null, isPublic, now) as unknown as { run: () => Promise<unknown> }
		);
		for (let i = 0; i < cleanCards.length; i++) {
			batch.push(
				db.prepare(`INSERT INTO deck_cards (id, deck_id, front, back, sort) VALUES (?, ?, ?, ?, ?)`)
					.bind(newId('dc'), id, cleanCards[i].front.slice(0, 5000), cleanCards[i].back.slice(0, 5000), i) as unknown as { run: () => Promise<unknown> }
			);
		}
		await db.batch(batch as never[]);
		if (lessonIds.length > 0) {
			try {
				await setDeckLessons(db, id, lessonIds);
			} catch {
				// nem kritikus
			}
		}
		return ok({ ok: true, id, cardKind }, 201);
	}
	if (head === 'decks' && second && third === 'cards' && method === 'GET') {
		const owner = await db.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`).bind(second).first<{ userId: string }>().catch(() => null);
		if (!owner || owner.userId !== user.id) return err('Nincs ilyen csomag.', 404);
		const res = await db
			.prepare(`SELECT id, COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM deck_cards WHERE deck_id = ? ORDER BY sort, id LIMIT 1000`)
			.bind(second)
			.all();
		return ok({ cards: res.results ?? [] });
	}
	if (head === 'decks' && second && !third) {
		const owner = await db.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`).bind(second).first<{ userId: string }>().catch(() => null);
		if (!owner || owner.userId !== user.id) return err('Nincs ilyen csomag.', 404);
		if (method === 'GET') {
			const deck = await db
				.prepare(`SELECT id, title, COALESCE(kind, 'cards') AS kind, COALESCE(card_kind, 'word') AS cardKind, subject_id AS subjectId, level_id AS levelId, material_id AS materialId, lesson_id AS lessonId, COALESCE(is_public, 0) AS isPublic FROM decks WHERE id = ?`)
				.bind(second)
				.first();
			const cards = await db
				.prepare(`SELECT id, COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(section_slug, '') AS sectionSlug FROM deck_cards WHERE deck_id = ? ORDER BY sort, id LIMIT 1000`)
				.bind(second)
				.all();
			return ok({ deck, cards: cards.results ?? [] });
		}
		if (method === 'PATCH') {
			const body = await readJson(event);
			const sets: string[] = [];
			const args: (string | null)[] = [];
			if (body.title !== undefined) {
				const t = String(body.title).trim();
				if (!t) return err('Add meg a csomag címét.', 400);
				sets.push('title = ?');
				args.push(t.slice(0, 200));
			}
			if (body.subjectId !== undefined || body.subject_id !== undefined) {
				sets.push('subject_id = ?');
				args.push(String(body.subjectId ?? body.subject_id ?? '').trim() || null);
			}
			if (body.levelId !== undefined || body.level_id !== undefined) {
				sets.push('level_id = ?');
				args.push(String(body.levelId ?? body.level_id ?? '').trim() || null);
			}
			if (body.materialId !== undefined || body.material_id !== undefined) {
				sets.push('material_id = ?');
				args.push(String(body.materialId ?? body.material_id ?? '').trim() || null);
			}
			let nextLessonIds: string[] | null = null;
			if (body.lessonIds !== undefined) {
				nextLessonIds = Array.isArray(body.lessonIds) ? [...new Set(body.lessonIds.map((s: unknown) => String(s).trim()).filter(Boolean))].slice(0, 50) : [];
				sets.push('lesson_id = ?');
				args.push(nextLessonIds[0] ?? null);
			} else if (body.lessonId !== undefined || body.lesson_id !== undefined) {
				const l = String(body.lessonId ?? body.lesson_id ?? '').trim() || null;
				sets.push('lesson_id = ?');
				args.push(l);
				nextLessonIds = l ? [l] : [];
			}
			if (body.isPublic !== undefined || body.is_public !== undefined) {
				const v = body.isPublic ?? body.is_public;
				sets.push('is_public = ?');
				args.push(v === true || v === 1 ? '1' : '0');
			}
			if (sets.length === 0 && nextLessonIds === null) return err('Nincs módosítás.', 400);
			if (sets.length > 0) {
				await db.prepare(`UPDATE decks SET ${sets.join(', ')} WHERE id = ?`).bind(...args, second).run();
			}
			if (nextLessonIds !== null) {
				try {
					await setDeckLessons(db, second, nextLessonIds);
				} catch {
					// nem kritikus
				}
			}
			return ok({ ok: true });
		}
		if (method === 'DELETE') {
			await db.batch([
				db.prepare(`DELETE FROM deck_cards WHERE deck_id = ?`).bind(second),
				db.prepare(`DELETE FROM decks WHERE id = ? AND user_id = ?`).bind(second, user.id)
			]);
			try {
				await db.prepare(`DELETE FROM deck_lessons WHERE deck_id = ?`).bind(second).run();
			} catch {
				// kapcsoló még nincs
			}
			return ok({ ok: true });
		}
	}

	/* Saját kártyák */
	if (head === 'deck-cards' && method === 'GET' && !second) {
		const deckId = strParam(url, 'deckId') || strParam(url, 'deck_id');
		if (!deckId) return err('Hiányzik a deckId.', 400);
		const owner = await db.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`).bind(deckId).first<{ userId: string }>().catch(() => null);
		if (!owner || owner.userId !== user.id) return err('Nincs ilyen csomag.', 404);
		const res = await db
			.prepare(`SELECT id, deck_id AS deckId, COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(section_slug, '') AS sectionSlug, COALESCE(sort, 0) AS sort FROM deck_cards WHERE deck_id = ? ORDER BY sort, id LIMIT 1000`)
			.bind(deckId)
			.all();
		return ok({ cards: res.results ?? [] });
	}
	if (head === 'deck-cards' && method === 'POST' && !second) {
		const body = await readJson(event);
		const deckId = String(body.deckId ?? body.deck_id ?? '').trim();
		const front = String(body.front ?? '').trim();
		const back = String(body.back ?? '').trim();
		if (!deckId) return err('Hiányzik a deckId.', 400);
		if (!front || !back) return err('Töltsd ki a kártya mindkét oldalát.', 400);
		const owner = await db.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`).bind(deckId).first<{ userId: string }>().catch(() => null);
		if (!owner || owner.userId !== user.id) return err('Nincs ilyen csomag.', 404);
		const count = await db.prepare(`SELECT COUNT(*) AS n FROM deck_cards WHERE deck_id = ?`).bind(deckId).first<{ n: number }>().catch(() => ({ n: 0 }));
		if ((count?.n ?? 0) >= 500) return err('Egy csomagban legfeljebb 500 kártya lehet.', 400);
		const maxSort = await db.prepare(`SELECT COALESCE(MAX(sort), -1) AS m FROM deck_cards WHERE deck_id = ?`).bind(deckId).first<{ m: number }>().catch(() => ({ m: -1 }));
		const id = newId('dc');
		await db
			.prepare(`INSERT INTO deck_cards (id, deck_id, front, back, sort, section_slug) VALUES (?, ?, ?, ?, ?, ?)`)
			.bind(id, deckId, front.slice(0, 5000), back.slice(0, 5000), (maxSort?.m ?? -1) + 1, String(body.sectionSlug ?? body.section_slug ?? '').trim().slice(0, 80))
			.run();
		return ok({ ok: true, id }, 201);
	}
	if (head === 'deck-cards' && second) {
		const own = await db
			.prepare(`SELECT deck_cards.id AS id FROM deck_cards JOIN decks ON decks.id = deck_cards.deck_id WHERE deck_cards.id = ? AND decks.user_id = ?`)
			.bind(second, user.id)
			.first()
			.catch(() => null);
		if (!own) return err('Nincs ilyen kártya.', 404);
		if (method === 'GET') {
			const row = await db.prepare(`SELECT id, deck_id AS deckId, COALESCE(front, '') AS front, COALESCE(back, '') AS back, COALESCE(section_slug, '') AS sectionSlug FROM deck_cards WHERE id = ?`).bind(second).first();
			return ok({ card: row });
		}
		if (method === 'PATCH') {
			const body = await readJson(event);
			const sets: string[] = [];
			const args: string[] = [];
			if (body.front !== undefined) {
				const f = String(body.front).trim();
				if (!f) return err('Az előlap nem lehet üres.', 400);
				sets.push('front = ?');
				args.push(f.slice(0, 5000));
			}
			if (body.back !== undefined) {
				const b = String(body.back).trim();
				if (!b) return err('A hátlap nem lehet üres.', 400);
				sets.push('back = ?');
				args.push(b.slice(0, 5000));
			}
			if (body.sectionSlug !== undefined || body.section_slug !== undefined) {
				sets.push('section_slug = ?');
				args.push(String(body.sectionSlug ?? body.section_slug ?? '').trim().slice(0, 80));
			}
			if (sets.length === 0) return err('Nincs módosítás.', 400);
			await db.prepare(`UPDATE deck_cards SET ${sets.join(', ')} WHERE id = ?`).bind(...args, second).run();
			return ok({ ok: true });
		}
		if (method === 'DELETE') {
			await db.prepare(`DELETE FROM deck_cards WHERE id = ?`).bind(second).run();
			return ok({ ok: true });
		}
	}

	/* Haladás: leckék */
	if (head === 'progress' && second === 'lessons' && method === 'GET' && !third) {
		const lessonId = strParam(url, 'lessonId');
		if (lessonId) {
			const row = await db.prepare(`SELECT user_id AS userId, lesson_id AS lessonId, done, score, total, updated_at AS updatedAt FROM lesson_progress WHERE user_id = ? AND lesson_id = ?`).bind(user.id, lessonId).first().catch(() => null);
			return ok({ progress: row ?? { userId: user.id, lessonId, done: 0, score: null, total: null } });
		}
		const limit = intParam(url, 'limit', 200, 1000);
		const res = await db.prepare(`SELECT lesson_id AS lessonId, done, score, total, updated_at AS updatedAt FROM lesson_progress WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`).bind(user.id, limit).all().catch(() => ({ results: [] }));
		return ok({ progress: (res as { results: unknown[] }).results ?? [] });
	}
	if (head === 'progress' && second === 'lessons' && method === 'POST' && !third) {
		const body = await readJson(event);
		const lessonId = String(body.lessonId ?? body.lesson_id ?? '').trim();
		if (!lessonId) return err('Hiányzik a lessonId.', 400);
		const done = body.done === true || body.done === 1 || body.done === '1';
		const score = typeof body.score === 'number' ? body.score : null;
		const total = typeof body.total === 'number' ? body.total : null;
		const now = Date.now();
		const day = new Date(now).toISOString().slice(0, 10);
		try {
			await db.batch([
				db.prepare(`INSERT OR REPLACE INTO lesson_progress (user_id, lesson_id, done, score, total, updated_at, event_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(user.id, lessonId, done ? 1 : 0, score, total, Math.floor(now / 1000), now),
				db.prepare(`INSERT OR IGNORE INTO learning_days (user_id, day) VALUES (?, ?)`).bind(user.id, day)
			]);
		} catch {
			await db.batch([
				db.prepare(`INSERT OR REPLACE INTO lesson_progress (user_id, lesson_id, done, score, total, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(user.id, lessonId, done ? 1 : 0, score, total, Math.floor(now / 1000)),
				db.prepare(`INSERT OR IGNORE INTO learning_days (user_id, day) VALUES (?, ?)`).bind(user.id, day)
			]);
		}
		return ok({ ok: true });
	}

	/* Haladás: kártyák */
	if (head === 'progress' && second === 'cards' && !third && method === 'GET') {
		const res = await db
			.prepare(`SELECT card_key AS key, known, seen, COALESCE(repetitions, 0) AS repetitions, COALESCE(ease, 2.5) AS ease, COALESCE(interval_days, 0) AS intervalDays, COALESCE(due_day, 0) AS dueDay FROM card_progress WHERE user_id = ? LIMIT 5000`)
			.bind(user.id)
			.all()
			.catch(() => ({ results: [] }));
		return ok({ progress: (res as { results: unknown[] }).results ?? [] });
	}
	if (head === 'progress' && second === 'cards' && third === 'due' && method === 'GET') {
		// Esedékes kártyák: deckId / pack / lesson szűréssel, SM-2 dueDay alapján.
		const deckId = strParam(url, 'deck') || strParam(url, 'deckId');
		const pack = strParam(url, 'pack');
		const lesson = strParam(url, 'lesson') || strParam(url, 'lessonId');
		const today = Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) / 86400000);
		let cardIds: string[] = [];
		if (deckId) {
			const owner = await db.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`).bind(deckId).first<{ userId: string }>().catch(() => null);
			if (!owner || owner.userId !== user.id) return err('Nincs ilyen csomag.', 404);
			const r = await db.prepare(`SELECT id FROM deck_cards WHERE deck_id = ? LIMIT 2000`).bind(deckId).all<{ id: string }>();
			cardIds = (r.results ?? []).map((c) => c.id);
		} else if (pack) {
			const pid = pack.startsWith('pack:') ? pack.slice(5) : pack;
			const r = await db.prepare(`SELECT id FROM lesson_cards WHERE pack_id = ? LIMIT 2000`).bind(pid).all<{ id: string }>();
			cardIds = (r.results ?? []).map((c) => c.id);
		} else if (lesson) {
			const r = await db.prepare(`SELECT id FROM lesson_cards WHERE lesson_id = ? LIMIT 2000`).bind(lesson).all<{ id: string }>();
			cardIds = (r.results ?? []).map((c) => c.id);
		} else {
			return err('Add meg a deck, pack vagy lesson paramétert.', 400);
		}
		if (cardIds.length === 0) return ok({ due: [], fresh: [], future: [], today, total: 0 });
		const prog = new Map<string, { seen: number; repetitions: number; dueDay: number }>();
		for (let o = 0; o < cardIds.length; o += 80) {
			const chunk = cardIds.slice(o, o + 80);
			const r = await db.prepare(`SELECT card_key AS key, seen, COALESCE(repetitions, 0) AS repetitions, COALESCE(due_day, 0) AS dueDay FROM card_progress WHERE user_id = ? AND card_key IN (${chunk.map(() => '?').join(', ')})`).bind(user.id, ...chunk).all<{ key: string; seen: number; repetitions: number; dueDay: number }>().catch(() => ({ results: [] }));
			for (const row of (r.results ?? [])) prog.set(row.key, row);
		}
		const due: string[] = [];
		const fresh: string[] = [];
		const future: string[] = [];
		for (const id of cardIds) {
			const m = prog.get(id);
			if (!m || (m.seen === 0 && m.repetitions === 0)) {
				due.push(id);
				fresh.push(id);
			} else if (m.dueDay <= today) {
				due.push(id);
			} else {
				future.push(id);
			}
		}
		return ok({ due, fresh, future, today, total: cardIds.length });
	}
	if (head === 'progress' && second === 'cards' && third === 'review' && method === 'POST') {
		const body = await readJson(event);
		const raw = Array.isArray(body.results) ? body.results : Array.isArray(body.reviews) ? body.reviews : [];
		const results = (raw as unknown[])
			.filter((r): r is { key: string; known?: unknown } => !!r && typeof r === 'object' && typeof (r as { key?: unknown }).key === 'string')
			.slice(0, 500)
			.map((r) => {
				const o = r as { key: string; known?: unknown; correct?: unknown };
				const known = o.known === true || o.correct === true;
				return { key: o.key, known };
			});
		if (results.length === 0) return err('Hiányzik a results lista.', 400);
		const { saveCardProgress } = await import('$lib/server/curriculum');
		await saveCardProgress(db, user.id, results);
		return ok({ ok: true, saved: results.length });
	}

	/* Haladás: összesítő */
	if (head === 'progress' && second === 'stats' && method === 'GET') {
		const lessons = await db.prepare(`SELECT COUNT(*) AS n FROM lesson_progress WHERE user_id = ? AND done = 1`).bind(user.id).first<{ n: number }>().catch(() => ({ n: 0 }));
		const cards = await db.prepare(`SELECT COUNT(*) AS n FROM card_progress WHERE user_id = ?`).bind(user.id).first<{ n: number }>().catch(() => ({ n: 0 }));
		const decks = await db.prepare(`SELECT COUNT(*) AS n FROM decks WHERE user_id = ?`).bind(user.id).first<{ n: number }>().catch(() => ({ n: 0 }));
		return ok({ stats: { lessonsDone: lessons?.n ?? 0, cardsTouched: cards?.n ?? 0, decks: decks?.n ?? 0, streak: user.streak ?? 0, xp: user.xp ?? 0 } });
	}

	/* Könyvtár */
	if (head === 'library' && method === 'GET' && !second) {
		const savedRes = await db.prepare(`SELECT quiz_id AS id, added_at AS addedAt FROM library WHERE user_id = ? LIMIT 500`).bind(user.id).all().catch(() => ({ results: [] }));
		const mine = await db.prepare(`SELECT id, title FROM decks WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`).bind(user.id).all().catch(() => ({ results: [] }));
		return ok({ saved: (savedRes as { results: unknown[] }).results ?? [], decks: (mine as { results: unknown[] }).results ?? [] });
	}
	if (head === 'library' && method === 'POST' && !second) {
		const body = await readJson(event);
		const quizId = String(body.quizId ?? body.quiz_id ?? body.id ?? '').trim();
		if (!quizId) return err('Hiányzik a csomag azonosítója.', 400);
		if (quizId.startsWith('deck:')) {
			const deckId = quizId.slice(5);
			const owner = await db.prepare(`SELECT user_id AS userId FROM decks WHERE id = ?`).bind(deckId).first<{ userId: string }>().catch(() => null);
			if (owner && owner.userId === user.id) return ok({ ok: true, owned: true });
			const pub = await db.prepare(`SELECT id FROM decks WHERE id = ? AND COALESCE(is_public, 0) = 1`).bind(deckId).first<{ id: string }>().catch(() => null);
			if (!pub) return err('Nincs ilyen csomag.', 404);
			await db.prepare(`INSERT OR IGNORE INTO library (user_id, quiz_id, added_at) VALUES (?, ?, ?)`).bind(user.id, quizId, Math.floor(Date.now() / 1000)).run();
			return ok({ ok: true });
		}
		if (quizId.startsWith('pack:') || quizId.startsWith('cards:')) {
			await db.prepare(`INSERT OR IGNORE INTO library (user_id, quiz_id, added_at) VALUES (?, ?, ?)`).bind(user.id, quizId, Math.floor(Date.now() / 1000)).run();
			return ok({ ok: true });
		}
		return err('Csak pack:..., cards:... vagy publikált deck:... azonosító menthető.', 400);
	}
	if (head === 'library' && method === 'DELETE' && !second) {
		const body = await readJson(event);
		const quizId = String(body.quizId ?? body.quiz_id ?? url.searchParams.get('id') ?? '').trim();
		if (!quizId) return err('Hiányzik a csomag azonosítója.', 400);
		await db.prepare(`DELETE FROM library WHERE user_id = ? AND quiz_id = ?`).bind(user.id, quizId).run();
		return ok({ ok: true });
	}

	/* Keresés */
	if (head === 'search' && method === 'GET') {
		const q = strParam(url, 'q') || strParam(url, 'query');
		if (q.length < 2) return err('A kereséshez legalább 2 karakter kell.', 400);
		const subjectId = strParam(url, 'subjectId');
		const limit = intParam(url, 'limit', 20, 50);
		const like = `%${q}%`;
		const subjCond = subjectId ? 'AND s.id = ?' : '';
		const subjArgs = subjectId ? [subjectId] : [];
		const lessons = await db
			.prepare(
				`SELECT le.id, le.title, s.title AS subjectTitle FROM lessons le
				 JOIN materials m ON m.id = le.material_id
				 JOIN levels l ON l.id = m.level_id AND ${publishedLevelSql('l')}
				 JOIN subjects s ON s.id = l.subject_id
				 WHERE (le.title LIKE ? OR le.body_md LIKE ?) ${subjCond}
				 ORDER BY le.title LIMIT ?`
			)
			.bind(like, like, ...subjArgs, limit)
			.all()
			.catch(() => ({ results: [] }));
		const decks = await db
			.prepare(`SELECT id, title FROM decks WHERE user_id = ? AND title LIKE ? ORDER BY created_at DESC LIMIT ?`)
			.bind(user.id, like, limit)
			.all()
			.catch(() => ({ results: [] }));
		return ok({ lessons: (lessons as { results: unknown[] }).results ?? [], decks: (decks as { results: unknown[] }).results ?? [] });
	}

	return err(`Ismeretlen végpont: /api/v1/${segments.join('/')}`, 404);
}

function openapi(): Record<string, unknown> {
	return {
		openapi: '3.0.0',
		info: { title: 'Leardy Public API', version: '1.0.0', description: 'Tanulás és kártyák kezelése tanári API kulccsal.' },
		servers: [{ url: '/api/v1' }],
		security: [{ bearerAuth: [] }],
		components: {
			securitySchemes: {
				bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'ld_...' }
			}
		},
		paths: {
			'/me': { get: { summary: 'Saját fiók' } },
			'/subjects': { get: { summary: 'Tantárgyak listája' } },
			'/subjects/{id}': { get: { summary: 'Tantárgy részletei' } },
			'/levels': { get: { summary: 'Szintek' } },
			'/materials': { get: { summary: 'Témakörök' } },
			'/lessons': { get: { summary: 'Leckék' }, post: { summary: 'Lecke létrehozása' } },
			'/lessons/{id}': { get: { summary: 'Lecke' }, patch: { summary: 'Lecke szerkesztése' }, delete: { summary: 'Lecke törlése' } },
			'/quizzes': { get: { summary: 'Kvízek' }, post: { summary: 'Kvíz létrehozása' } },
			'/quiz-questions': { get: { summary: 'Kérdések' }, post: { summary: 'Kérdés létrehozása' } },
			'/card-packs': { get: { summary: 'Hivatalos csomagok' }, post: { summary: 'Csomag létrehozása' } },
			'/lesson-cards': { get: { summary: 'Hivatalos kártyák' }, post: { summary: 'Kártya létrehozása' } },
			'/decks': { get: { summary: 'Saját csomagok' }, post: { summary: 'Csomag létrehozása' } },
			'/deck-cards': { get: { summary: 'Saját kártyák' }, post: { summary: 'Kártya létrehozása' } },
			'/progress/lessons': { get: { summary: 'Leckehaladás' }, post: { summary: 'Haladás mentése' } },
			'/progress/cards': { get: { summary: 'Kártyahaladás' } },
			'/progress/cards/due': { get: { summary: 'Esedékes kártyák' } },
			'/progress/cards/review': { post: { summary: 'Osztályzatok mentése' } },
			'/progress/stats': { get: { summary: 'Összesítő' } },
			'/library': { get: { summary: 'Könyvtár' }, post: { summary: 'Mentés' }, delete: { summary: 'Törlés' } },
			'/search': { get: { summary: 'Keresés' } }
		}
	};
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

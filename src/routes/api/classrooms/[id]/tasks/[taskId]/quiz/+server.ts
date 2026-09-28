import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassContentSchema } from '$lib/server/classroom';
import { ensureCurriculumSchema } from '$lib/server/curriculum';

/* Feladat kvízének összeállítása kitöltéshez.
   GET: a feladat leckéinek összes kérdéséből véletlen (kevert) vagy fix sorrendű,
   question_count darabos mintát ad. Minden kevert kitöltés más sorrendet kap. */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	await ensureCurriculumSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });

	const classroomId = event.params.id ?? '';
	const taskId = event.params.taskId ?? '';
	if (!classroomId || !taskId) return json({ error: 'Hibás kérés.' }, { status: 400 });

	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(classroomId)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });

	if (room.teacher_id !== user.id) {
		const member = await db
			.prepare(`SELECT user_id FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
			.bind(classroomId, user.id)
			.first<{ user_id: string }>();
		if (!member) return json({ error: 'Nem vagy az osztály tagja.' }, { status: 403 });
	}

	const task = await db
		.prepare(
			`SELECT lesson_ids_json, question_count, target_pct, shuffle FROM classroom_tasks
			 WHERE id = ? AND classroom_id = ?`
		)
		.bind(taskId, classroomId)
		.first<{ lesson_ids_json: string; question_count: number; target_pct: number; shuffle: number }>();
	if (!task) return json({ error: 'Nincs ilyen feladat.' }, { status: 404 });

	let lessonIds: string[] = [];
	try {
		const raw = JSON.parse(task.lesson_ids_json ?? '[]') as unknown;
		if (Array.isArray(raw)) {
			const seen = new Set<string>();
			for (const l of raw) {
				const id = typeof l === 'string' ? l : String((l as { id?: unknown })?.id ?? '').trim();
				if (!id || seen.has(id)) continue;
				seen.add(id);
				lessonIds.push(id);
				if (lessonIds.length >= 20) break;
			}
		}
	} catch {
		lessonIds = [];
	}
	if (lessonIds.length === 0) return json({ error: 'A feladathoz nincs lecke.' }, { status: 400 });

	const quizRes = await db
		.prepare(`SELECT id FROM quizzes WHERE lesson_id IN (${lessonIds.map(() => '?').join(',')})`)
		.bind(...lessonIds)
		.all<{ id: string }>();
	const quizIds = (quizRes.results ?? []).map((q) => q.id);
	if (quizIds.length === 0) return json({ questions: [], total_available: 0 }, { status: 200 });

	const qRes = await db
		.prepare(
			`SELECT id, quiz_id, question_text, COALESCE(type, 'choice') AS type,
				COALESCE(options_json, '[]') AS options_json,
				COALESCE(correct_answer, '') AS correct_answer
			 FROM quiz_questions WHERE quiz_id IN (${quizIds.map(() => '?').join(',')})
			 ORDER BY sort, id`
		)
		.bind(...quizIds)
		.all<{
			id: string;
			quiz_id: string;
			question_text: string;
			type: string;
			options_json: string;
			correct_answer: string;
		}>();

	interface QuizQuestion {
		id: string;
		question_text: string;
		type: string;
		options: string[];
		pairs: { left: string; right: string }[];
		correct_answer: string;
	}

	const all: QuizQuestion[] = [];
	for (const row of qRes.results ?? []) {
		let options: string[] = [];
		let pairs: { left: string; right: string }[] = [];
		try {
			const parsed: unknown = JSON.parse(row.options_json ?? '[]');
			if (Array.isArray(parsed)) {
				options = parsed.map((v) => String(v));
			} else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { pairs?: unknown }).pairs)) {
				const rawPairs = (parsed as { pairs: unknown[] }).pairs;
				pairs = rawPairs
					.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
					.map((p) => ({ left: String(p.left ?? ''), right: String(p.right ?? '') }));
			}
		} catch {
			// hibás JSON: üres marad
		}
		all.push({
			id: row.id,
			question_text: row.question_text,
			type: row.type ?? 'choice',
			options,
			pairs,
			correct_answer: row.correct_answer ?? ''
		});
	}

	const totalAvailable = all.length;
	if (task.shuffle) {
		for (let i = all.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[all[i], all[j]] = [all[j], all[i]];
		}
	}
	const count = Math.max(1, Math.min(task.question_count || 10, all.length));
	return json(
		{
			questions: all.slice(0, count),
			total_available: totalAvailable,
			question_count: task.question_count,
			target_pct: task.target_pct,
			shuffle: task.shuffle
		},
		{ status: 200 }
	);
};

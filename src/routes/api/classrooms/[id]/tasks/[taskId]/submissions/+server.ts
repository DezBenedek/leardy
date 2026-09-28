import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassContentSchema } from '$lib/server/classroom';

interface SubmissionRow {
	task_id: string;
	user_id: string;
	best_score: number;
	best_total: number;
	best_pct: number;
	attempts: number;
	submitted: number;
	submitted_at: number | null;
	updated_at: number;
}

async function checkAccess(
	db: NonNullable<ReturnType<typeof getDb>>,
	classroomId: string,
	userId: string
) {
	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(classroomId)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return { error: 'Nincs ilyen osztály.', status: 404 } as const;
	if (room.teacher_id === userId) return { own: true as const, room };
	const member = await db
		.prepare(`SELECT user_id FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
		.bind(classroomId, userId)
		.first<{ user_id: string }>();
	if (!member) return { error: 'Nem vagy az osztály tagja.', status: 403 } as const;
	return { own: false as const, room };
}

/* Beküldések lekérése.
   Tanár: minden tag sora a feladathoz (névvel, akkor is ha még nem töltötte ki).
   Diák: csak a saját sora (vagy null). */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroomId = event.params.id ?? '';
	const taskId = event.params.taskId ?? '';

	const access = await checkAccess(db, classroomId, user.id);
	if ('error' in access) return json({ error: access.error }, { status: access.status });

	const task = await db
		.prepare(`SELECT id, due_date FROM classroom_tasks WHERE id = ? AND classroom_id = ?`)
		.bind(taskId, classroomId)
		.first<{ id: string; due_date: number | null }>();
	if (!task) return json({ error: 'Nincs ilyen feladat.' }, { status: 404 });

	if (access.own) {
		const rows = await db
			.prepare(
				`SELECT u.id AS user_id, u.name AS name,
					s.best_score, s.best_total, s.best_pct, s.attempts, s.submitted, s.submitted_at
				 FROM classroom_members m
				 JOIN users u ON u.id = m.user_id
				 LEFT JOIN task_submissions s ON s.task_id = ? AND s.user_id = u.id
				 WHERE m.classroom_id = ? ORDER BY u.name LIMIT 500`
			)
			.bind(taskId, classroomId)
			.all<{
				user_id: string;
				name: string;
				best_score: number | null;
				best_total: number | null;
				best_pct: number | null;
				attempts: number | null;
				submitted: number | null;
				submitted_at: number | null;
			}>();
		return json({ results: rows.results ?? [] }, { status: 200 });
	}

	const own = await db
		.prepare(`SELECT * FROM task_submissions WHERE task_id = ? AND user_id = ?`)
		.bind(taskId, user.id)
		.first<SubmissionRow>();
	return json({ mine: own ?? null }, { status: 200 });
};

/* Pontszám mentése és beküldés-jelölés.
   Body: { score, total } kitöltés mentése (legjobb eredmény megmarad),
   vagy { submitted: true } beküldés (cél alatt is),
   vagy { submitted: false } visszavonás (csak határidő előtt). */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroomId = event.params.id ?? '';
	const taskId = event.params.taskId ?? '';

	const access = await checkAccess(db, classroomId, user.id);
	if ('error' in access) return json({ error: access.error }, { status: access.status });
	if (access.own) return json({ error: 'Tanárként nem küldhetsz be feladatot.' }, { status: 403 });

	const task = await db
		.prepare(`SELECT id, due_date FROM classroom_tasks WHERE id = ? AND classroom_id = ?`)
		.bind(taskId, classroomId)
		.first<{ id: string; due_date: number | null }>();
	if (!task) return json({ error: 'Nincs ilyen feladat.' }, { status: 404 });

	let body: { score?: unknown; total?: unknown; submitted?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}

	const now = Date.now();

	if (body.submitted !== undefined) {
		const want = body.submitted === true || body.submitted === 1;
		if (!want && task.due_date && now > task.due_date)
			return json({ error: 'Határidő után nem vonható vissza.' }, { status: 403 });
		await db
			.prepare(
				`INSERT INTO task_submissions
					(task_id, user_id, classroom_id, best_score, best_total, best_pct, attempts, submitted, submitted_at, updated_at)
				 VALUES (?, ?, ?, 0, 0, 0, 0, ?, ?, ?)
				 ON CONFLICT(task_id, user_id) DO UPDATE SET
					submitted = excluded.submitted,
					submitted_at = excluded.submitted_at,
					updated_at = excluded.updated_at`
			)
			.bind(taskId, user.id, classroomId, want ? 1 : 0, want ? now : null, now)
			.run();
		const mine = await db
			.prepare(`SELECT * FROM task_submissions WHERE task_id = ? AND user_id = ?`)
			.bind(taskId, user.id)
			.first<SubmissionRow>();
		return json({ ok: true, mine }, { status: 200 });
	}

	const score = Math.round(Number(body.score));
	const total = Math.round(Number(body.total));
	if (!Number.isInteger(score) || !Number.isInteger(total) || score < 0 || total <= 0 || score > total)
		return json({ error: 'Hibás pontszám.' }, { status: 400 });
	const pct = Math.round((score / total) * 100);

	const prev = await db
		.prepare(`SELECT * FROM task_submissions WHERE task_id = ? AND user_id = ?`)
		.bind(taskId, user.id)
		.first<SubmissionRow>();
	const better = !prev || pct > prev.best_pct;
	await db
		.prepare(
			`INSERT INTO task_submissions
				(task_id, user_id, classroom_id, best_score, best_total, best_pct, attempts, submitted, submitted_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, 1, 0, NULL, ?)
			 ON CONFLICT(task_id, user_id) DO UPDATE SET
				attempts = task_submissions.attempts + 1,
				best_score = ?, best_total = ?, best_pct = ?,
				updated_at = ?`
		)
		.bind(
			taskId, user.id, classroomId,
			better ? score : (prev?.best_score ?? score),
			better ? total : (prev?.best_total ?? total),
			better ? pct : (prev?.best_pct ?? pct),
			now,
			better ? score : (prev?.best_score ?? score),
			better ? total : (prev?.best_total ?? total),
			better ? pct : (prev?.best_pct ?? pct),
			now
		)
		.run();
	const mine = await db
		.prepare(`SELECT * FROM task_submissions WHERE task_id = ? AND user_id = ?`)
		.bind(taskId, user.id)
		.first<SubmissionRow>();
	return json({ ok: true, mine }, { status: 200 });
};

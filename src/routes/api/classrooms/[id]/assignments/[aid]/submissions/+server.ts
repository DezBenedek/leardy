import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassContentSchema, type AssignmentSubmission, type AssignmentUpload } from '$lib/server/classroom';

async function checkAccess(db: NonNullable<ReturnType<typeof getDb>>, classroomId: string, userId: string) {
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

async function uploadsFor(db: NonNullable<ReturnType<typeof getDb>>, assignmentId: string, userId: string) {
	const rows = await db
		.prepare(
			`SELECT id, assignment_id, classroom_id, user_id, kind, r2_key, file_name, mime, size, width, height, created_at
			 FROM assignment_uploads WHERE assignment_id = ? AND user_id = ? ORDER BY created_at`
		)
		.bind(assignmentId, userId)
		.all<AssignmentUpload>();
	return rows.results ?? [];
}

/* Beküldések: tanár mindent lát, diák csak a sajátját. */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroomId = event.params.id ?? '';
	const aid = event.params.aid ?? '';

	const access = await checkAccess(db, classroomId, user.id);
	if ('error' in access) return json({ error: access.error }, { status: access.status });

	const assignment = await db
		.prepare(`SELECT * FROM classroom_assignments WHERE id = ? AND classroom_id = ?`)
		.bind(aid, classroomId)
		.first<{ id: string }>();
	if (!assignment) return json({ error: 'Nincs ilyen beadandó.' }, { status: 404 });

	if (access.own) {
		const members = await db
			.prepare(
				`SELECT u.id AS user_id, u.name AS name,
					s.text_body, s.submitted, s.submitted_at, s.updated_at,
					s.grade, s.feedback, s.graded_at
				 FROM classroom_members m
				 JOIN users u ON u.id = m.user_id
				 LEFT JOIN assignment_submissions s ON s.assignment_id = ? AND s.user_id = u.id
				 WHERE m.classroom_id = ? ORDER BY u.name LIMIT 500`
			)
			.bind(aid, classroomId)
			.all<{
				user_id: string;
				name: string;
				text_body: string | null;
				submitted: number | null;
				submitted_at: number | null;
				updated_at: number | null;
				grade: number | null;
				feedback: string | null;
				graded_at: number | null;
			}>();
		const rows = members.results ?? [];
		const out: {
			user_id: string;
			name: string;
			text_body: string;
			submitted: number;
			submitted_at: number | null;
			grade: number | null;
			feedback: string;
			graded_at: number | null;
			image_count: number;
			file_count: number;
			uploads: AssignmentUpload[];
		}[] = [];
		for (const r of rows) {
			const ups = await uploadsFor(db, aid, r.user_id);
			out.push({
				user_id: r.user_id,
				name: r.name,
				text_body: r.text_body ?? '',
				submitted: r.submitted ?? 0,
				submitted_at: r.submitted_at ?? null,
				grade: r.grade ?? null,
				feedback: r.feedback ?? '',
				graded_at: r.graded_at ?? null,
				image_count: ups.filter((u) => u.kind === 'image').length,
				file_count: ups.filter((u) => u.kind === 'file').length,
				uploads: ups.map((u) => ({ ...u, r2_key: '' }))
			});
		}
		return json({ results: out }, { status: 200 });
	}

	const mine = await db
		.prepare(`SELECT * FROM assignment_submissions WHERE assignment_id = ? AND user_id = ?`)
		.bind(aid, user.id)
		.first<AssignmentSubmission>();
	const uploads = (await uploadsFor(db, aid, user.id)).map((u) => ({ ...u, r2_key: '' }));
	return json({ mine: mine ?? null, uploads }, { status: 200 });
};

/* Diák menti a szöveget / beküldi a beadandót. Body: { text?, submitted? } */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const classroomId = event.params.id ?? '';
	const aid = event.params.aid ?? '';

	const access = await checkAccess(db, classroomId, user.id);
	if ('error' in access) return json({ error: access.error }, { status: access.status });
	if (access.own) return json({ error: 'Tanárként nem küldhetsz be beadandót.' }, { status: 403 });

	const assignment = await db
		.prepare(
			`SELECT id, due_date, require_text, require_images, require_files, require_audio
			 FROM classroom_assignments WHERE id = ? AND classroom_id = ?`
		)
		.bind(aid, classroomId)
		.first<{
			id: string;
			due_date: number | null;
			require_text: number;
			require_images: number;
			require_files: number;
			require_audio: number | null;
		}>();
	if (!assignment) return json({ error: 'Nincs ilyen beadandó.' }, { status: 404 });

	let body: { text?: unknown; submitted?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}

	const now = Date.now();
	const text = String(body.text ?? '').slice(0, 20000);
	const wantSubmit = body.submitted === true || body.submitted === 1;
	const wantWithdraw = body.submitted === false || body.submitted === 0;

	if (wantSubmit) {
		if (assignment.due_date && now > assignment.due_date)
			return json({ error: 'A határidő lejárt, már nem küldhető be.' }, { status: 403 });
		// Üresen is beadható: a követelmények (szöveg, kép, hang, fájl) nem blokkolják a beküldést.
	}

	if (wantWithdraw && assignment.due_date && now > assignment.due_date)
		return json({ error: 'Határidő után nem vonható vissza.' }, { status: 403 });

	// Piszkozat mentése mindig mehet (határidő után is menthető szöveg? nem: zároljuk).
	if (!wantSubmit && !wantWithdraw && assignment.due_date && now > assignment.due_date) {
		const prev = await db
			.prepare(`SELECT submitted FROM assignment_submissions WHERE assignment_id = ? AND user_id = ?`)
			.bind(aid, user.id)
			.first<{ submitted: number }>();
		if (!prev || prev.submitted !== 1)
			return json({ error: 'A határidő lejárt.' }, { status: 403 });
	}

	const prev = await db
		.prepare(`SELECT submitted, submitted_at FROM assignment_submissions WHERE assignment_id = ? AND user_id = ?`)
		.bind(aid, user.id)
		.first<{ submitted: number; submitted_at: number | null }>();

	let submitted = prev?.submitted ?? 0;
	let submittedAt = prev?.submitted_at ?? null;
	if (wantSubmit) {
		submitted = 1;
		submittedAt = now;
	} else if (wantWithdraw) {
		submitted = 0;
		submittedAt = null;
	}

	await db
		.prepare(
			`INSERT INTO assignment_submissions
				(assignment_id, user_id, classroom_id, text_body, submitted, submitted_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(assignment_id, user_id) DO UPDATE SET
				text_body = excluded.text_body,
				submitted = excluded.submitted,
				submitted_at = excluded.submitted_at,
				updated_at = excluded.updated_at`
		)
		.bind(aid, user.id, classroomId, text, submitted, submittedAt, now)
		.run();

	const mine = await db
		.prepare(`SELECT * FROM assignment_submissions WHERE assignment_id = ? AND user_id = ?`)
		.bind(aid, user.id)
		.first<AssignmentSubmission>();
	const uploads = (await uploadsFor(db, aid, user.id)).map((u) => ({ ...u, r2_key: '' }));
	return json({ ok: true, mine, uploads }, { status: 200 });
};

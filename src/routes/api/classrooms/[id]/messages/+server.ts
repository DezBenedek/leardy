import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureClassContentSchema, type MessageRefType } from '$lib/server/classroom';
import { fireNotify, notifyClassroom } from '$lib/server/push';

const REF_TYPES: MessageRefType[] = ['', 'subject', 'lesson', 'quiz', 'deck', 'topic'];
const MAX_REFS = 10;

interface RefInput {
	ref_type?: unknown;
	ref_id?: unknown;
	ref_title?: unknown;
}

/* Üzenet küldése az osztályfalra: csak a saját tanár.
   Body: { title, body?, ref_type?, ref_id?, ref_title?, refs?: [{ref_type, ref_id, ref_title}] } */
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureClassContentSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';

	const room = await db
		.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
		.bind(id)
		.first<{ id: string; teacher_id: string }>();
	if (!room) return json({ error: 'Nincs ilyen osztály.' }, { status: 404 });
	if (room.teacher_id !== user.id)
		return json({ error: 'Csak az osztály tanára küldhet üzenetet.' }, { status: 403 });

	let body: {
		title?: unknown;
		body?: unknown;
		ref_type?: unknown;
		ref_id?: unknown;
		ref_title?: unknown;
		refs?: unknown;
	};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const title = String(body.title ?? '').trim().replace(/\s+/g, ' ');
	const text = String(body.body ?? '').trim().slice(0, 2000);
	if (title.length < 3) return json({ error: 'Adj legalább 3 karakteres címet!' }, { status: 400 });
	if (title.length > 120) return json({ error: 'A cím legfeljebb 120 karakter lehet.' }, { status: 400 });

	// Több csatolmány (új), vagy egy csatolmány (régi forma).
	let refs: { refType: string; refId: string; refTitle: string }[] = [];
	if (Array.isArray(body.refs)) {
		for (const r of (body.refs as RefInput[]).slice(0, MAX_REFS)) {
			const t = String(r?.ref_type ?? '') as MessageRefType;
			const rid = String(r?.ref_id ?? '').trim().slice(0, 120);
			const rtitle = String(r?.ref_title ?? '').trim().slice(0, 300);
			if (!REF_TYPES.includes(t) || t === '' || !rid) continue;
			if (refs.some((x) => x.refType === t && x.refId === rid)) continue;
			refs.push({ refType: t, refId: rid, refTitle: rtitle });
		}
	} else {
		const refType = String(body.ref_type ?? '') as MessageRefType;
		const refId = String(body.ref_id ?? '').trim().slice(0, 120);
		const refTitle = String(body.ref_title ?? '').trim().slice(0, 120);
		if (!REF_TYPES.includes(refType)) return json({ error: 'Ismeretlen csatolmánytípus.' }, { status: 400 });
		if (refType && !refId) return json({ error: 'Válassz csatolmányt!' }, { status: 400 });
		if (refType && refId) refs = [{ refType, refId, refTitle }];
	}

	const msgId = crypto.randomUUID();
	const first = refs[0];
	await db.batch([
		db
			.prepare(
				`INSERT INTO messages (id, classroom_id, teacher_id, title, body, ref_type, ref_id, ref_title, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				msgId,
				id,
				user.id,
				title,
				text,
				first?.refType ?? null,
				first?.refId ?? null,
				first?.refTitle || null,
				Date.now()
			),
		...refs.map((r, i) =>
			db
				.prepare(
					`INSERT OR IGNORE INTO message_refs (message_id, ref_type, ref_id, ref_title, sort)
					 VALUES (?, ?, ?, ?, ?)`
				)
				.bind(msgId, r.refType, r.refId, r.refTitle, i)
		)
	]);
	fireNotify(event, notifyClassroom(db, {
		classroomId: id,
		excludeUserId: user.id,
		title: 'Új tantermi üzenet',
		body: title,
		url: `/tanterem/${id}`,
		tag: `msg:${msgId}`,
		kind: 'message'
	}));
	return json({ ok: true, id: msgId }, { status: 201 });
};

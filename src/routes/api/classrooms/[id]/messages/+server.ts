import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, newId, requireUser } from '$lib/server/db';

async function canSee(
	db: NonNullable<ReturnType<typeof getDb>>,
	classroomId: string,
	userId: string
): Promise<'teacher' | 'member' | null> {
	const room = await db
		.prepare(`SELECT teacher_id FROM classrooms WHERE id = ?`)
		.bind(classroomId)
		.first<{ teacher_id: string }>();
	if (!room) return null;
	if (room.teacher_id === userId) return 'teacher';
	const m = await db
		.prepare(`SELECT 1 AS x FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
		.bind(classroomId, userId)
		.first();
	return m ? 'member' : null;
}

function refLink(ref_type: string | null, ref_id: string | null): string | null {
	if (!ref_type || !ref_id) return null;
	if (ref_type === 'topic') return `/temakorok/${ref_id}`;
	if (ref_type === 'lesson') return `/lecke/${ref_id}`;
	return null;
}

// GET /api/classrooms/[id]/messages — osztályüzenetek (cím + dátum, rákattintva szöveg).
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if (!(await canSee(db, id, user.id))) {
		return json({ error: 'Nem vagy tagja ennek az osztálynak.' }, { status: 403 });
	}
	const rows = await db
		.prepare(
			`SELECT m.id, m.title, m.body, m.link_url, m.ref_type, m.ref_id, m.created_at, u.name AS teacher_name
			 FROM messages m JOIN users u ON u.id = m.teacher_id
			 WHERE m.classroom_id = ? ORDER BY m.created_at DESC LIMIT 50`
		)
		.bind(id)
		.all<{
			id: string; title: string; body: string; link_url: string | null;
			ref_type: string | null; ref_id: string | null; created_at: number; teacher_name: string;
		}>();
	const messages = await Promise.all(
		(rows.results ?? []).map(async (m) => {
			let ref_title: string | null = null;
			if (m.ref_type === 'topic' && m.ref_id) {
				const t = await db.prepare(`SELECT title FROM topics WHERE id = ?`).bind(m.ref_id).first<{ title: string }>();
				ref_title = t?.title ?? null;
			} else if (m.ref_type === 'lesson' && m.ref_id) {
				const l = await db.prepare(`SELECT title FROM lessons WHERE id = ?`).bind(m.ref_id).first<{ title: string }>();
				ref_title = l?.title ?? null;
			}
			return { ...m, ref_link: refLink(m.ref_type, m.ref_id), ref_title };
		})
	);
	return json({ messages });
};

// POST /api/classrooms/[id]/messages — új üzenet (tanár).
export const POST: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Jelentkezz be!' }, { status: 401 });
	const id = event.params.id ?? '';
	if ((await canSee(db, id, user.id)) !== 'teacher') {
		return json({ error: 'Üzenni csak a tanár tud.' }, { status: 403 });
	}
	let body: { title?: unknown; body?: unknown; link_url?: unknown; ref_type?: unknown; ref_id?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Hibás kérés.' }, { status: 400 });
	}
	const title = String(body.title ?? '').trim();
	if (title.length < 2) return json({ error: 'Adj legalább 2 karakteres címet.' }, { status: 400 });
	const linkRaw = String(body.link_url ?? '').trim();
	const link_url = linkRaw ? (/^https?:\/\//i.test(linkRaw) ? linkRaw : `https://${linkRaw}`) : null;
	const ref_type = body.ref_type === 'topic' || body.ref_type === 'lesson' ? String(body.ref_type) : null;
	const ref_id = ref_type ? String(body.ref_id ?? '').trim() || null : null;
	if (ref_type === 'topic' && ref_id) {
		const t = await db.prepare(`SELECT id FROM topics WHERE id = ?`).bind(ref_id).first();
		if (!t) return json({ error: 'Nincs ilyen témakör.' }, { status: 404 });
	}
	if (ref_type === 'lesson' && ref_id) {
		const l = await db.prepare(`SELECT id FROM lessons WHERE id = ?`).bind(ref_id).first();
		if (!l) return json({ error: 'Nincs ilyen lecke.' }, { status: 404 });
	}
	const msgId = newId();
	await db
		.prepare(
			`INSERT INTO messages (id, classroom_id, teacher_id, title, body, link_url, ref_type, ref_id, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(msgId, id, user.id, title, String(body.body ?? ''), link_url, ref_type, ref_id, Date.now())
		.run();
	return json({ message: { id: msgId } }, { status: 201 });
};

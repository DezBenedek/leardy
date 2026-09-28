import type { PageServerLoad } from './$types';
import { getDb, getSessionUser, type PublicUser } from '$lib/server/db';
import { isTeacher, type Classroom } from '$lib/server/classroom';

export const load: PageServerLoad = async (event) => {
	try {
		const db = getDb(event);
		if (!db) return { teaching: [], joined: [], isTeacher: false };
		// Nincs ensure*: a séma-önhelyreállítás az író API-kon van,
		// hogy az oldalváltást ne blokkolja több DDL-kör.
		// D1-optimalizálás: a user a layout-betöltésből jön (parent),
		// nem kérdezzük le a sessiont másodszor.
		let user: PublicUser | null = null;
		try {
			const parent = await event.parent();
			user = (parent?.user as PublicUser | null) ?? null;
		} catch {
			user = null;
		}
		if (!user) {
			user = await getSessionUser(event, db);
		}
		if (!user) return { teaching: [], joined: [], isTeacher: false };
		if (isTeacher(user)) {
			const teaching = await db
				.prepare(
					`SELECT c.id, c.teacher_id, u.name AS teacher_name, c.code, c.name,
						COALESCE(c.subject, '') AS subject, COALESCE(c.description, '') AS description,
						c.created_at, COUNT(m.user_id) AS member_count
					 FROM classrooms c
					 LEFT JOIN users u ON u.id = c.teacher_id
					 LEFT JOIN classroom_members m ON m.classroom_id = c.id
					 WHERE c.teacher_id = ?
					 GROUP BY c.id ORDER BY c.created_at DESC`
				)
				.bind(user.id)
				.all<Classroom>();
			return { teaching: teaching.results ?? [], joined: [], isTeacher: true };
		}
		const joined = await db
			.prepare(
				`SELECT c.id, c.teacher_id, u.name AS teacher_name, c.code, c.name,
					COALESCE(c.subject, '') AS subject, COALESCE(c.description, '') AS description,
					c.created_at, COUNT(m2.user_id) AS member_count
				 FROM classroom_members m
				 JOIN classrooms c ON c.id = m.classroom_id
				 LEFT JOIN users u ON u.id = c.teacher_id
				 LEFT JOIN classroom_members m2 ON m2.classroom_id = c.id
				 WHERE m.user_id = ?
				 GROUP BY c.id ORDER BY c.created_at DESC`
			)
			.bind(user.id)
			.all<Classroom>();
		return { teaching: [], joined: joined.results ?? [], isTeacher: false };
	} catch {
		return { teaching: [], joined: [], isTeacher: false };
	}
};

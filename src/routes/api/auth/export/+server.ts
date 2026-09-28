import { json, type RequestHandler } from '@sveltejs/kit';
import { ensureAuthSchema, getDb, requireUser } from '$lib/server/db';
import { ensureAssignmentSchema, ensureClassContentSchema, ensureSecuritySchema } from '$lib/server/classroom';
import { ensureCurriculumSchema } from '$lib/server/curriculum';

/* Saját adatok letöltése (GDPR export): profil, haladás, kártyák, tantermi beküldések. */
export const GET: RequestHandler = async (event) => {
	const db = getDb(event);
	if (!db) return json({ error: 'Az adatbázis most nem elérhető.' }, { status: 503 });
	await ensureAuthSchema(db);
	await ensureSecuritySchema(db);
	await ensureClassContentSchema(db);
	await ensureCurriculumSchema(db);
	const user = await requireUser(event, db);
	if (!user) return json({ error: 'Nincs bejelentkezve.' }, { status: 401 });

	const q = async <T>(sql: string, ...params: (string | number)[]): Promise<T[]> => {
		try {
			const r = await db.prepare(sql).bind(...params).all<T>();
			return r.results ?? [];
		} catch {
			return [];
		}
	};
	const profile = await db
		.prepare(`SELECT id, name, email, role, xp, streak, created_at FROM users WHERE id = ?`)
		.bind(user.id)
		.first();
	return json({
		exported_at: Date.now(),
		profile,
		lesson_progress: await q(`SELECT * FROM lesson_progress WHERE user_id = ?`, user.id),
		card_progress: await q(`SELECT * FROM card_progress WHERE user_id = ?`, user.id),
		decks: await q(`SELECT * FROM decks WHERE user_id = ?`, user.id),
		library: await q(`SELECT * FROM library WHERE user_id = ?`, user.id),
		task_submissions: await q(`SELECT * FROM task_submissions WHERE user_id = ?`, user.id),
		assignment_submissions: await q(`SELECT * FROM assignment_submissions WHERE user_id = ?`, user.id),
		classroom_members: await q(`SELECT * FROM classroom_members WHERE user_id = ?`, user.id)
	});
};

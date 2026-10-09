import type { D1Database } from '@cloudflare/workers-types';
import { error, type RequestEvent } from '@sveltejs/kit';
import { getDb, requireUser, type PublicUser } from './db';
import type { EditorCandidate, EditorLesson, EditorLevel } from '$lib/curriculum-editor';
import { publishedLevelSql } from './curriculum-publication';

export function canCreateLevel(user: PublicUser): boolean {
	return user.role === 'teacher' || !!user.is_admin;
}

export async function editorContext(event: RequestEvent) {
	const db = getDb(event);
	if (!db) error(503, 'Az adatbázis most nem elérhető.');
	const user = await requireUser(event, db);
	if (!user) error(401, 'A szerkesztéshez jelentkezz be.');
	return { db, user };
}

export async function canEnterEditor(db: D1Database, user: PublicUser): Promise<boolean> {
	if (canCreateLevel(user)) return true;
	const row = await db.prepare('SELECT 1 FROM level_editors WHERE email = ? LIMIT 1')
		.bind(user.email.trim().toLowerCase()).first();
	return !!row;
}

export async function requireLevelEditor(db: D1Database, user: PublicUser, levelId: string) {
	const level = await db.prepare(`SELECT l.id, l.subject_id, ls.owner_id,
		COALESCE(ls.published, 1) AS published, u.email AS owner_email
		FROM levels l LEFT JOIN level_settings ls ON ls.level_id = l.id
		LEFT JOIN users u ON u.id = ls.owner_id WHERE l.id = ?`)
		.bind(levelId).first<{ id: string; subject_id: string; owner_id: string | null; published: number; owner_email: string | null }>();
	if (!level) error(404, 'Nincs ilyen tananyag.');
	if (user.is_admin || level.owner_id === user.id) return level;
	const editor = await db.prepare('SELECT 1 FROM level_editors WHERE level_id = ? AND email = ?')
		.bind(levelId, user.email.trim().toLowerCase()).first();
	if (!editor) error(403, 'Ehhez a tananyaghoz nincs szerkesztési jogosultságod.');
	return level;
}

/** A tantárgyválasztó csak a felhasználó által szerkeszthető tananyagokat számolja. */
export async function countEditorLevelsBySubject(db: D1Database, user: PublicUser): Promise<Record<string, number>> {
	const rows = await db.prepare(`SELECT l.subject_id, COUNT(*) AS count
		FROM levels l LEFT JOIN level_settings ls ON ls.level_id = l.id
		WHERE ? = 1 OR ls.owner_id = ?
		OR EXISTS (SELECT 1 FROM level_editors e WHERE e.level_id = l.id AND e.email = ?)
		GROUP BY l.subject_id`)
		.bind(user.is_admin ? 1 : 0, user.id, user.email.trim().toLowerCase())
		.all<{ subject_id: string; count: number }>();
	return Object.fromEntries(rows.results.map((row) => [row.subject_id, row.count]));
}

export async function getEditorLevels(db: D1Database, user: PublicUser, subjectId: string): Promise<EditorLevel[]> {
	const email = user.email.trim().toLowerCase();
	const levelRows = await db.prepare(`SELECT l.id, l.title, l.sort,
		COALESCE(ls.published, 1) AS published, ls.owner_id, u.email AS owner_email,
		(? = 1 OR ls.owner_id = ? OR EXISTS (SELECT 1 FROM level_editors e WHERE e.level_id = l.id AND e.email = ?)) AS can_edit
		FROM levels l LEFT JOIN level_settings ls ON ls.level_id = l.id
		LEFT JOIN users u ON u.id = ls.owner_id
		WHERE l.subject_id = ? AND (${publishedLevelSql('l')} OR ? = 1 OR ls.owner_id = ?
		OR EXISTS (SELECT 1 FROM level_editors e WHERE e.level_id = l.id AND e.email = ?))
		ORDER BY l.sort, l.title, l.id`)
		.bind(user.is_admin ? 1 : 0, user.id, email, subjectId, user.is_admin ? 1 : 0, user.id, email)
		.all<{ id: string; title: string; sort: number; published: number; owner_id: string | null; owner_email: string | null; can_edit: number }>();
	const rows = levelRows.results ?? [];
	if (!rows.length) return [];
	// Egy nagy szintlista sem lépheti túl a D1 kötöttparaméter-korlátját.
	const groups = [];
	for (let offset = 0; offset < rows.length; offset += 80) {
		const ids = rows.slice(offset, offset + 80).map((row) => row.id);
		const placeholders = ids.map(() => '?').join(', ');
		groups.push(db.batch([
			db.prepare(`SELECT id, level_id, title, sort FROM materials WHERE level_id IN (${placeholders}) ORDER BY sort, title, id`).bind(...ids),
			db.prepare(`SELECT le.id, le.material_id, le.title, le.sort FROM lessons le JOIN materials m ON m.id = le.material_id
				WHERE m.level_id IN (${placeholders}) ORDER BY le.sort, le.title, le.id`).bind(...ids),
			db.prepare(`SELECT level_id, email FROM level_editors WHERE level_id IN (${placeholders}) ORDER BY email`).bind(...ids)
		]));
	}
	const batches = await Promise.all(groups);
	const materialRows = batches.flatMap(([materials]) => materials.results) as { id: string; level_id: string; title: string; sort: number }[];
	const lessonRows = batches.flatMap(([, lessons]) => lessons.results) as { id: string; material_id: string; title: string; sort: number }[];
	const editorRows = batches.flatMap(([, , editors]) => editors.results) as { level_id: string; email: string }[];
	return rows.map((row) => ({
		id: row.id, title: row.title, sort: row.sort,
		published: !!row.published, canEdit: !!row.can_edit,
		ownerId: row.can_edit ? row.owner_id : null,
		ownerEmail: row.can_edit ? row.owner_email : null,
		editors: row.can_edit ? editorRows.filter((e) => e.level_id === row.id).map((e) => e.email) : [],
		materials: materialRows.filter((m) => m.level_id === row.id).map((m) => ({
			id: m.id, title: m.title, sort: m.sort,
			lessons: lessonRows.filter((le) => le.material_id === m.id).map((le) => ({ ...le, done: false }))
		}))
	}));
}

export async function getEditorLesson(db: D1Database, user: PublicUser, id: string): Promise<EditorLesson> {
	const lesson = await db.prepare(`SELECT le.id, le.title, le.body_md, m.level_id AS levelId,
		l.subject_id AS subjectId, m.title AS materialTitle, l.title AS levelTitle
		FROM lessons le JOIN materials m ON m.id = le.material_id JOIN levels l ON l.id = m.level_id WHERE le.id = ?`)
		.bind(id).first<EditorLesson>();
	if (!lesson) error(404, 'Nincs ilyen lecke.');
	await requireLevelEditor(db, user, lesson.levelId);
	return lesson;
}

export async function searchEditorCandidates(db: D1Database, user: PublicUser, levelId: string, query: string, limit = 8): Promise<EditorCandidate[]> {
	const level = await requireLevelEditor(db, user, levelId);
	const needle = query.trim().toLowerCase();
	if (!needle) return [];
	if (needle.length > 254) error(400, 'Az e-mail-cím legfeljebb 254 karakter lehet.');
	const rows = await db.prepare(`SELECT u.id, u.name, u.email FROM users u
		WHERE instr(lower(u.email), ?) > 0 AND u.id <> COALESCE(?, '')
		AND NOT EXISTS (SELECT 1 FROM level_editors e WHERE e.level_id = ? AND e.email = lower(u.email))
		ORDER BY CASE WHEN lower(u.email) = ? THEN 0 ELSE 1 END, lower(u.email), u.id LIMIT ?`)
		.bind(needle, level.owner_id, levelId, needle, limit).all<EditorCandidate>();
	return rows.results;
}

function textField(body: Record<string, unknown>, key: string, max = 160): string {
	const value = body[key];
	if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
		error(400, `A mező kitöltése kötelező, legfeljebb ${max} karakterrel: ${key === 'title' ? 'név' : 'azonosító'}.`);
	}
	return value.trim();
}

function emailField(body: Record<string, unknown>): string {
	const email = textField(body, 'email', 254).toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error(400, 'Adj meg érvényes e-mail-címet.');
	return email;
}

/** Minden írás ugyanazt a tananyaghoz kötött jogosultságvizsgálatot használja. */
export async function mutateCurriculum(db: D1Database, user: PublicUser, body: Record<string, unknown>) {
	const action = body.action;
	if (action === 'createLevel') {
		if (!canCreateLevel(user)) error(403, 'Új tananyagot tanár hozhat létre.');
		const subjectId = textField(body, 'subjectId');
		const title = textField(body, 'title');
		if (!await db.prepare('SELECT id FROM subjects WHERE id = ?').bind(subjectId).first()) error(404, 'Nincs ilyen tantárgy.');
		const id = crypto.randomUUID();
		await db.batch([
			db.prepare(`INSERT INTO levels (id, subject_id, title, sort) VALUES (?, ?, ?,
				(SELECT COALESCE(MAX(sort), -1) + 1 FROM levels WHERE subject_id = ?))`).bind(id, subjectId, title, subjectId),
			db.prepare('INSERT INTO level_settings (level_id, owner_id, published) VALUES (?, ?, 0)').bind(id, user.id)
		]);
		return { id };
	}
	const levelId = textField(body, 'levelId');
	const level = await requireLevelEditor(db, user, levelId);
	if (action === 'updateLevel') {
		const title = textField(body, 'title');
		if (typeof body.published !== 'boolean') error(400, 'Add meg a publikálás állapotát.');
		await db.batch([
			db.prepare('UPDATE levels SET title = ? WHERE id = ?').bind(title, levelId),
			db.prepare(`INSERT INTO level_settings (level_id, owner_id, published) VALUES (?, ?, ?)
				ON CONFLICT(level_id) DO UPDATE SET published = excluded.published`).bind(levelId, level.owner_id, body.published ? 1 : 0)
		]);
		return {};
	}
	if (action === 'addEditor' || action === 'removeEditor') {
		const email = emailField(body);
		if (email === level.owner_email?.trim().toLowerCase()) error(400, 'A tulajdonos mindig szerkesztő marad.');
		if (action === 'addEditor' && !await db.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(email).first()) {
			error(404, 'Ezzel az e-mail-címmel nincs regisztrált felhasználó.');
		}
		await (action === 'addEditor'
			? db.prepare('INSERT OR IGNORE INTO level_editors (level_id, email) VALUES (?, ?)')
			: db.prepare('DELETE FROM level_editors WHERE level_id = ? AND email = ?'))
			.bind(levelId, email).run();
		return {};
	}
	if (action === 'createTopic') {
		const id = crypto.randomUUID();
		await db.prepare(`INSERT INTO materials (id, level_id, title, sort) VALUES (?, ?, ?,
			(SELECT COALESCE(MAX(sort), -1) + 1 FROM materials WHERE level_id = ?))`)
			.bind(id, levelId, textField(body, 'title'), levelId).run();
		return { id };
	}
	if (action === 'renameTopic' || action === 'createLesson' || action === 'deleteTopic') {
		const topicId = textField(body, 'topicId');
		if (!await db.prepare('SELECT id FROM materials WHERE id = ? AND level_id = ?').bind(topicId, levelId).first()) error(404, 'Nincs ilyen témakör ezen a tananyagban.');
		if (action === 'deleteTopic') {
			await db.prepare('DELETE FROM materials WHERE id = ? AND level_id = ?').bind(topicId, levelId).run();
			return {};
		}
		const title = textField(body, 'title');
		if (action === 'renameTopic') {
			await db.prepare('UPDATE materials SET title = ? WHERE id = ? AND level_id = ?').bind(title, topicId, levelId).run();
			return {};
		}
		const id = crypto.randomUUID();
		await db.prepare(`INSERT INTO lessons (id, material_id, title, body_md, sort) VALUES (?, ?, ?, '',
			(SELECT COALESCE(MAX(sort), -1) + 1 FROM lessons WHERE material_id = ?))`).bind(id, topicId, title, topicId).run();
		return { id };
	}
	if (action === 'reorderTopics' || action === 'reorderLessons') {
		const ids = body.ids;
		if (!Array.isArray(ids) || ids.length > 500 || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) error(400, 'Érvénytelen sorrend.');
		const topics = action === 'reorderTopics';
		const parentId = topics ? levelId : textField(body, 'topicId');
		if (!topics && !await db.prepare('SELECT id FROM materials WHERE id = ? AND level_id = ?').bind(parentId, levelId).first()) error(404, 'Nincs ilyen témakör ezen a tananyagban.');
		const table = topics ? 'materials' : 'lessons';
		const parent = topics ? 'level_id' : 'material_id';
		const existing = await db.prepare(`SELECT id FROM ${table} WHERE ${parent} = ?`).bind(parentId).all<{ id: string }>();
		if (existing.results.length !== ids.length || existing.results.some((row) => !ids.includes(row.id))) error(409, 'A lista megváltozott. Frissítsd az oldalt a rendezés előtt.');
		if (ids.length) await db.batch(ids.map((id, sort) => db.prepare(`UPDATE ${table} SET sort = ? WHERE id = ? AND ${parent} = ?`).bind(sort, id, parentId)));
		return {};
	}
	if (action === 'saveLesson' || action === 'deleteLesson') {
		const lessonId = textField(body, 'lessonId');
		const lesson = await getEditorLesson(db, user, lessonId);
		if (lesson.levelId !== levelId) error(404, 'Nincs ilyen lecke ezen a tananyagban.');
		if (action === 'deleteLesson') {
			await db.prepare('DELETE FROM lessons WHERE id = ?').bind(lessonId).run();
			return {};
		}
		const title = textField(body, 'title');
		if (typeof body.body_md !== 'string' || body.body_md.length > 200_000) error(400, 'A lecke tartalma legfeljebb 200 000 karakter lehet.');
		if (typeof body.originalTitle !== 'string' || typeof body.originalBody !== 'string') error(400, 'Hiányzik a lecke eredeti változata.');
		const result = await db.prepare(`UPDATE lessons SET title = ?, body_md = ?
			WHERE id = ? AND title = ? AND body_md = ?`)
			.bind(title, body.body_md, lessonId, body.originalTitle, body.originalBody).run();
		if (!result.meta.changes) error(409, 'Egy másik szerkesztő már módosította a leckét. A munkád megmaradt; frissítés előtt másold ki.');
		return { title, body_md: body.body_md };
	}
	error(400, 'Ismeretlen szerkesztési művelet.');
}

import { isQuestionType, loadQuestionOptions, questionType, readQuestionOptions, storedQuestionOptions } from '../question-types/registry';
import type { D1Database } from '@cloudflare/workers-types';
import { error, type RequestEvent } from '@sveltejs/kit';
import { getDb, requireUser, type PublicUser } from './db';
import type { EditorCandidate, EditorLesson, EditorLevel, EditorQuestion, EditorQuiz } from '$lib/curriculum-editor';
import { publishedLevelSql } from './curriculum-publication';
import { lessonContentMarkdown, readLessonContent, validateLessonContent } from '../lesson-content';

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
	const lesson = await db.prepare(`SELECT le.id, le.title, le.body_md, le.content_json, le.content_revision AS contentRevision, m.level_id AS levelId,
		l.subject_id AS subjectId, m.title AS materialTitle, l.title AS levelTitle
		FROM lessons le JOIN materials m ON m.id = le.material_id JOIN levels l ON l.id = m.level_id WHERE le.id = ?`)
		.bind(id).first<EditorLesson & { content_json: string | null }>();
	if (!lesson) error(404, 'Nincs ilyen lecke.');
	await requireLevelEditor(db, user, lesson.levelId);
	const { content_json, ...fields } = lesson;
	const content = readLessonContent(content_json);
	if (content_json && !content) error(409, 'Ez a lecke újabb tartalomformátumot használ. Frissítsd a szerkesztőt.');
	return { ...fields, content };
}

/** Kvízblokkok kérdésekkel a lecke szerkesztőhöz (lecke szintű lista). */
export async function getEditorQuizzes(db: D1Database, user: PublicUser, lessonId: string): Promise<EditorQuiz[]> {
	const lesson = await getEditorLesson(db, user, lessonId);
	const quizRows = await db.prepare(
		`SELECT id, title, COALESCE(section_slug, '') AS section_slug, COALESCE(sort, 0) AS sort
		 FROM quizzes WHERE lesson_id = ? ORDER BY sort, title, id`
	).bind(lesson.id).all<{ id: string; title: string; section_slug: string; sort: number }>();
	const quizzes = quizRows.results ?? [];
	if (quizzes.length === 0) return [];
	// Régi adatbázison még hiányozhat a kérdés szintű oszlop: ilyenkor
	// bekötés nélkül térünk vissza, íráskor pedig pótoljuk az oszlopot.
	let questionRows: { id: string; quiz_id: string; question_text: string; type: string; options_json: string; correct_answer: string; section_slug?: string; sort: number }[] = [];
	try {
		const res = await db.prepare(
			`SELECT id, quiz_id, question_text, COALESCE(type, 'choice') AS type,
				COALESCE(options_json, '[]') AS options_json,
				COALESCE(correct_answer, '') AS correct_answer,
				COALESCE(section_slug, '') AS section_slug, COALESCE(sort, 0) AS sort
			 FROM quiz_questions WHERE quiz_id IN (${quizzes.map(() => '?').join(', ')}) ORDER BY sort, id`
		).bind(...quizzes.map((q) => q.id)).all<typeof questionRows[number]>();
		questionRows = res.results ?? [];
	} catch {
		const res = await db.prepare(
			`SELECT id, quiz_id, question_text, COALESCE(type, 'choice') AS type,
				COALESCE(options_json, '[]') AS options_json,
				COALESCE(correct_answer, '') AS correct_answer, COALESCE(sort, 0) AS sort
			 FROM quiz_questions WHERE quiz_id IN (${quizzes.map(() => '?').join(', ')}) ORDER BY sort, id`
		).bind(...quizzes.map((q) => q.id)).all<typeof questionRows[number]>();
		questionRows = res.results ?? [];
	}
	return quizzes.map((quiz) => ({
		id: quiz.id,
		title: quiz.title,
		section_slug: quiz.section_slug ?? '',
		sort: quiz.sort ?? 0,
		questions: questionRows
			.filter((row) => row.quiz_id === quiz.id)
			.map((row) => ({
				id: row.id,
				quiz_id: row.quiz_id,
				question_text: row.question_text,
				type: row.type ?? 'choice',
				...loadQuestionOptions(row.type ?? 'choice', row.options_json),
				correct_answer: row.correct_answer ?? '',
				sectionSlug: row.section_slug ?? '',
				sort: row.sort ?? 0
			}))
	}));
}

/** Kérdés szintű oszlop pótlása régi adatbázison (idempotens). */
async function ensureQuestionSectionColumn(db: D1Database): Promise<void> {
	try {
		await db.prepare(`ALTER TABLE quiz_questions ADD COLUMN section_slug TEXT NOT NULL DEFAULT ''`).run();
	} catch {
		// az oszlop már létezik
	}
}

function slugField(body: Record<string, unknown>, key: string): string {
	const value = body[key];
	if (value === undefined || value === null) return '';
	if (typeof value !== 'string') error(400, 'Érvénytelen bekezdés bekötés.');
	const slug = value.trim();
	if (slug.length > 100) error(400, 'A bekezdés bekötés túl hosszú.');
	return slug;
}

function questionTextField(body: Record<string, unknown>): string {
	const value = body.question_text;
	if (typeof value !== 'string' || !value.trim() || value.trim().length > 1000) {
		error(400, 'A kérdés szövege kötelező, legfeljebb 1000 karakterrel.');
	}
	return value.trim();
}

function quizTypeField(body: Record<string, unknown>): string {
	const type = body.type;
	if (typeof type !== 'string' || !isQuestionType(type)) error(400, 'Ismeretlen kérdéstípus.');
	return type;
}

/** Szerver oldali kérdés ellenőrzés a futtató szabályai szerint. */
function validateServerQuestion(type: string, options: string[], pairs: { left: string; right: string }[], correct: string): string | null {
	return questionType(type).validate({ options, pairs, correct_answer: correct });
}

function parseServerOptions(type: string, raw: unknown): { options: string[]; pairs: { left: string; right: string }[]; optionsJson: string } {
	try {
		const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
		const fields = readQuestionOptions(type, parsed);
		const imageUrl = parsed && typeof parsed === 'object' ? (parsed as { imageUrl?: unknown }).imageUrl : undefined;
		const stored = storedQuestionOptions(type, { ...fields, correct_answer: '', imageUrl });
		return { ...readQuestionOptions(type, stored), optionsJson: JSON.stringify(stored) };
	} catch {
		error(400, 'A válaszok vagy a kép formátuma érvénytelen.');
	}
}

/** Kvízblokk lekérése a tananyaghoz tartozás ellenőrzésével. */
async function requireQuizInLevel(db: D1Database, quizId: string, levelId: string): Promise<{ id: string; lesson_id: string }> {
	const quiz = await db.prepare(
		`SELECT q.id, q.lesson_id FROM quizzes q
		 JOIN lessons le ON le.id = q.lesson_id JOIN materials m ON m.id = le.material_id
		 WHERE q.id = ? AND m.level_id = ?`
	).bind(quizId, levelId).first<{ id: string; lesson_id: string }>();
	if (!quiz) error(404, 'Nincs ilyen kvíz ezen a tananyagban.');
	return quiz;
}

/** Kérdés lekérése a tananyaghoz tartozás ellenőrzésével. */
async function requireQuestionInLevel(db: D1Database, questionId: string, levelId: string): Promise<{ id: string; quiz_id: string; lesson_id: string }> {
	const row = await db.prepare(
		`SELECT qq.id, qq.quiz_id, q.lesson_id FROM quiz_questions qq
		 JOIN quizzes q ON q.id = qq.quiz_id
		 JOIN lessons le ON le.id = q.lesson_id JOIN materials m ON m.id = le.material_id
		 WHERE qq.id = ? AND m.level_id = ?`
	).bind(questionId, levelId).first<{ id: string; quiz_id: string; lesson_id: string }>();
	if (!row) error(404, 'Nincs ilyen kérdés ezen a tananyagban.');
	return row;
}

async function nextSort(db: D1Database, table: 'quizzes' | 'quiz_questions', column: 'lesson_id' | 'quiz_id', parentId: string): Promise<number> {
	const row = await db.prepare(
		`SELECT COALESCE(MAX(sort), -1) + 1 AS next FROM ${table} WHERE ${column} = ?`
	).bind(parentId).first<{ next: number }>();
	return row?.next ?? 0;
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
		if (typeof body.body_md !== 'string' || body.body_md.length > 1_000_000) error(400, 'A lecke tartalma túl hosszú.');
		if (typeof body.originalTitle !== 'string' || typeof body.originalBody !== 'string') error(400, 'Hiányzik a lecke eredeti változata.');
		if (lesson.content && !body.content) error(409, 'A lecke már vizuális tartalmat használ. Frissítsd a szerkesztőt a mentés előtt.');
		let content = null;
		if (body.content !== undefined && body.content !== null) {
			try { content = validateLessonContent(body.content); } catch (problem) { error(400, problem instanceof Error ? problem.message : 'Érvénytelen tartalom.'); }
			if (!Number.isSafeInteger(body.originalRevision)) error(400, 'Hiányzik a lecke eredeti verziója.');
		}
		const markdown = content ? lessonContentMarkdown(content) : body.body_md;
		if (!content && markdown.length > 200_000) error(400, 'A lecke tartalma legfeljebb 200 000 karakter lehet.');
		if (body.originalRevision !== undefined && !Number.isSafeInteger(body.originalRevision)) error(400, 'A lecke verziója érvénytelen.');
		const revision = body.originalRevision !== undefined ? Number(body.originalRevision) : lesson.contentRevision ?? 0;
		const result = await db.prepare(`UPDATE lessons SET title = ?, body_md = ?, content_json = ?, content_revision = content_revision + 1
			WHERE id = ? AND title = ? AND body_md = ? AND content_revision = ?`)
			.bind(title, markdown, content ? JSON.stringify(content) : null, lessonId, body.originalTitle, body.originalBody, revision).run();
		if (!result.meta.changes) error(409, 'Egy másik szerkesztő már módosította a leckét. A munkád megmaradt; frissítés előtt másold ki.');
		return { title, body_md: markdown, content, contentRevision: revision + 1 };
	}
	if (action === 'createQuiz' || action === 'renameQuiz' || action === 'deleteQuiz' || action === 'duplicateQuiz' || action === 'reorderQuizzes') {
		await ensureQuestionSectionColumn(db);
		if (action === 'createQuiz') {
			const lessonId = textField(body, 'lessonId');
			const lesson = await getEditorLesson(db, user, lessonId);
			if (lesson.levelId !== levelId) error(404, 'Nincs ilyen lecke ezen a tananyagban.');
			const title = textField(body, 'title');
			const sectionSlug = slugField(body, 'sectionSlug');
			const id = crypto.randomUUID();
			await db.prepare(`INSERT INTO quizzes (id, lesson_id, section_slug, title, sort) VALUES (?, ?, ?, ?, ?)`)
				.bind(id, lessonId, sectionSlug, title, await nextSort(db, 'quizzes', 'lesson_id', lessonId)).run();
			return { id };
		}
		if (action === 'reorderQuizzes') {
			const lessonId = textField(body, 'lessonId');
			const lesson = await getEditorLesson(db, user, lessonId);
			if (lesson.levelId !== levelId) error(404, 'Nincs ilyen lecke ezen a tananyagban.');
			const ids = body.ids;
			if (!Array.isArray(ids) || ids.length > 500 || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) error(400, 'Érvénytelen sorrend.');
			const existing = await db.prepare(`SELECT id FROM quizzes WHERE lesson_id = ?`).bind(lessonId).all<{ id: string }>();
			if (existing.results.length !== ids.length || existing.results.some((row) => !ids.includes(row.id))) error(409, 'A lista megváltozott. Frissítsd az oldalt a rendezés előtt.');
			if (ids.length) await db.batch(ids.map((id, sort) => db.prepare(`UPDATE quizzes SET sort = ? WHERE id = ? AND lesson_id = ?`).bind(sort, id, lessonId)));
			return {};
		}
		const quizId = textField(body, 'quizId');
		const quiz = await requireQuizInLevel(db, quizId, levelId);
		if (action === 'deleteQuiz') {
			await db.prepare('DELETE FROM quizzes WHERE id = ?').bind(quizId).run();
			return {};
		}
		if (action === 'duplicateQuiz') {
			const newQuizId = crypto.randomUUID();
			const source = await db.prepare(`SELECT title, section_slug, sort FROM quizzes WHERE id = ?`).bind(quizId)
				.first<{ title: string; section_slug: string; sort: number }>();
			const questions = await db.prepare(
				`SELECT question_text, type, options_json, correct_answer, sort FROM quiz_questions WHERE quiz_id = ? ORDER BY sort, id`
			).bind(quizId).all<{ question_text: string; type: string; options_json: string; correct_answer: string; sort: number }>();
			let sectionSlugs: string[] = [];
			try {
				const withSections = await db.prepare(`SELECT section_slug FROM quiz_questions WHERE quiz_id = ? ORDER BY sort, id`)
					.bind(quizId).all<{ section_slug: string }>();
				sectionSlugs = (withSections.results ?? []).map((r) => r.section_slug ?? '');
			} catch {
				sectionSlugs = [];
			}
			const batch = [
				db.prepare(`INSERT INTO quizzes (id, lesson_id, section_slug, title, sort) VALUES (?, ?, ?, ?, ?)`)
					.bind(newQuizId, quiz.lesson_id, source?.section_slug ?? '', `${source?.title ?? 'Kvíz'} (másolat)`, await nextSort(db, 'quizzes', 'lesson_id', quiz.lesson_id))
			];
			(questions.results ?? []).forEach((q, index) => {
				batch.push(db.prepare(
					`INSERT INTO quiz_questions (id, quiz_id, question_text, type, options_json, correct_answer, section_slug, sort)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
				).bind(crypto.randomUUID(), newQuizId, q.question_text, q.type, q.options_json, q.correct_answer, sectionSlugs[index] ?? '', q.sort ?? index));
			});
			await db.batch(batch);
			return { id: newQuizId };
		}
		const title = textField(body, 'title');
		const sectionSlug = slugField(body, 'sectionSlug');
		await db.prepare(`UPDATE quizzes SET title = ?, section_slug = ? WHERE id = ?`).bind(title, sectionSlug, quizId).run();
		return {};
	}
	if (action === 'saveQuestion' || action === 'deleteQuestion' || action === 'duplicateQuestion' || action === 'reorderQuestions' || action === 'reorderLessonQuestions' || action === 'moveQuestion') {
		await ensureQuestionSectionColumn(db);
		if (action === 'reorderLessonQuestions') {
			const lessonId = textField(body, 'lessonId');
			const lesson = await getEditorLesson(db, user, lessonId);
			if (lesson.levelId !== levelId) error(404, 'Nincs ilyen lecke ezen a tananyagban.');
			const ids = body.ids;
			if (!Array.isArray(ids) || ids.length > 500 || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) error(400, 'Érvénytelen sorrend.');
			const existing = await db.prepare(`SELECT qq.id, qq.quiz_id, qq.section_slug, q.section_slug AS quiz_section
				FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id
				WHERE q.lesson_id = ? ORDER BY q.sort, q.title, q.id, qq.sort, qq.id`)
				.bind(lessonId).all<{ id: string; quiz_id: string; section_slug: string; quiz_section: string }>();
			if (existing.results.length !== ids.length || existing.results.some((row) => !ids.includes(row.id))) error(409, 'A lista megváltozott. Frissítsd az oldalt a rendezés előtt.');
			const byId = new Map(existing.results.map((row) => [row.id, row]));
			// A blokkok mérete megmarad, a kérdések a kívánt sorrendben kapják a helyeket.
			// A bekezdés öröklését rögzítjük, így blokkhatáron átlépve sem változik.
			const assignments = ids.map((id, index) => ({ id: id as string, quizId: existing.results[index].quiz_id }));
			if (ids.length) await db.batch([...assignments.map(({ id, quizId }, sort) => {
				const source = byId.get(id)!;
				return db.prepare('UPDATE quiz_questions SET quiz_id = ?, sort = ?, section_slug = ? WHERE id = ?')
					.bind(quizId, sort, source.section_slug || source.quiz_section || '', id);
			}), db.prepare("UPDATE quizzes SET section_slug = '' WHERE lesson_id = ?").bind(lessonId)]);
			return { assignments };
		}
		if (action === 'reorderQuestions') {
			const quizId = textField(body, 'quizId');
			await requireQuizInLevel(db, quizId, levelId);
			const ids = body.ids;
			if (!Array.isArray(ids) || ids.length > 500 || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) error(400, 'Érvénytelen sorrend.');
			const existing = await db.prepare(`SELECT id FROM quiz_questions WHERE quiz_id = ?`).bind(quizId).all<{ id: string }>();
			if (existing.results.length !== ids.length || existing.results.some((row) => !ids.includes(row.id))) error(409, 'A lista megváltozott. Frissítsd az oldalt a rendezés előtt.');
			if (ids.length) await db.batch(ids.map((id, sort) => db.prepare(`UPDATE quiz_questions SET sort = ? WHERE id = ? AND quiz_id = ?`).bind(sort, id, quizId)));
			return {};
		}
		if (action === 'deleteQuestion') {
			await requireQuestionInLevel(db, textField(body, 'questionId'), levelId);
			await db.prepare('DELETE FROM quiz_questions WHERE id = ?').bind(textField(body, 'questionId')).run();
			return {};
		}
		if (action === 'duplicateQuestion') {
			const questionId = textField(body, 'questionId');
			const source = await requireQuestionInLevel(db, questionId, levelId);
			const row = await db.prepare(
				`SELECT question_text, type, options_json, correct_answer, sort FROM quiz_questions WHERE id = ?`
			).bind(questionId).first<{ question_text: string; type: string; options_json: string; correct_answer: string; sort: number }>();
			if (!row) error(404, 'Nincs ilyen kérdés.');
			let sectionSlug = '';
			try {
				const withSection = await db.prepare(`SELECT section_slug FROM quiz_questions WHERE id = ?`).bind(questionId)
					.first<{ section_slug: string }>();
				sectionSlug = withSection?.section_slug ?? '';
			} catch {
				// régi séma: bekötés nélkül másolunk
			}
			const id = crypto.randomUUID();
			const siblings = await db.prepare('SELECT id FROM quiz_questions WHERE quiz_id = ? ORDER BY sort, id').bind(source.quiz_id).all<{ id: string }>();
			const ordered = siblings.results.map((q) => q.id);
			ordered.splice(ordered.indexOf(questionId) + 1, 0, id);
			await db.batch([
				db.prepare(
				`INSERT INTO quiz_questions (id, quiz_id, question_text, type, options_json, correct_answer, section_slug, sort)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			).bind(id, source.quiz_id, row.question_text, row.type, row.options_json, row.correct_answer, sectionSlug, row.sort + 1),
				...ordered.map((siblingId, sort) => db.prepare('UPDATE quiz_questions SET sort = ? WHERE id = ?').bind(sort, siblingId))
			]);
			return { id };
		}
		if (action === 'moveQuestion') {
			const questionId = textField(body, 'questionId');
			const targetQuizId = textField(body, 'targetQuizId');
			const source = await requireQuestionInLevel(db, questionId, levelId);
			const target = await requireQuizInLevel(db, targetQuizId, levelId);
			if (source.lesson_id !== target.lesson_id) error(400, 'Kérdést csak ugyanazon lecke kvízblokkjai között lehet mozgatni.');
			await db.prepare(`UPDATE quiz_questions SET quiz_id = ?, sort = ? WHERE id = ?`)
				.bind(targetQuizId, await nextSort(db, 'quiz_questions', 'quiz_id', targetQuizId), questionId).run();
			return {};
		}
		const quizId = textField(body, 'quizId');
		await requireQuizInLevel(db, quizId, levelId);
		const type = quizTypeField(body);
		const questionText = questionTextField(body);
		const { options, pairs, optionsJson } = parseServerOptions(type, body.options_json);
		const correctRaw = typeof body.correct_answer === 'string' ? body.correct_answer.trim() : '';
		const correct = questionType(type).correctAnswer({ options, pairs, correct_answer: correctRaw });
		const problem = validateServerQuestion(type, options, pairs, correctRaw);
		if (problem) error(400, problem);
		const sectionSlug = slugField(body, 'sectionSlug');
		const rawId = body.questionId;
		// A lapos szerkesztő kérdésenként tárolja a bekezdéskapcsolatot.
		// Régi blokkok örökölt kapcsolatát előbb rögzítjük minden testvérkérdésen.
		const materializeSections = [
			db.prepare(`UPDATE quiz_questions SET section_slug = COALESCE((SELECT section_slug FROM quizzes WHERE id = ?), '')
				WHERE quiz_id = ? AND COALESCE(section_slug, '') = ''`).bind(quizId, quizId),
			db.prepare("UPDATE quizzes SET section_slug = '' WHERE id = ?").bind(quizId)
		];
		if (rawId === undefined || rawId === null || rawId === '') {
			const id = crypto.randomUUID();
			await db.batch([...materializeSections, db.prepare(
				`INSERT INTO quiz_questions (id, quiz_id, question_text, type, options_json, correct_answer, section_slug, sort)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			).bind(id, quizId, questionText, type, optionsJson, correct, sectionSlug, await nextSort(db, 'quiz_questions', 'quiz_id', quizId))]);
			return { id };
		}
		if (typeof rawId !== 'string' || !rawId.trim()) error(400, 'Érvénytelen kérdés azonosító.');
		const existing = await requireQuestionInLevel(db, rawId, levelId);
		if (existing.quiz_id !== quizId) error(400, 'A kérdés másik kvízblokkhoz tartozik. Mozgatáshoz a mozgatás műveletet használd.');
		await db.batch([...materializeSections, db.prepare(
			`UPDATE quiz_questions SET question_text = ?, type = ?, options_json = ?, correct_answer = ?, section_slug = ? WHERE id = ?`
		).bind(questionText, type, optionsJson, correct, sectionSlug, rawId)]);
		return { id: rawId };
	}
	error(400, 'Ismeretlen szerkesztési művelet.');
}

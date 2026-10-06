import type { D1Database } from '@cloudflare/workers-types';
import type { PublicUser } from './db';

export interface Classroom {
	id: string;
	teacher_id: string;
	teacher_name?: string;
	code: string;
	name: string;
	subject: string;
	description: string;
	created_at: number;
	member_count?: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Önhelyreállító tanterem-séma: új és régi DB-ken is biztonságos. */
export async function ensureClassroomSchema(db: D1Database): Promise<void> {
	await db.batch([
		db.prepare(
			`CREATE TABLE IF NOT EXISTS classrooms (
				id TEXT PRIMARY KEY,
				teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				code TEXT NOT NULL UNIQUE,
				name TEXT NOT NULL,
				subject TEXT NOT NULL DEFAULT '',
				description TEXT NOT NULL DEFAULT '',
				created_at INTEGER NOT NULL
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS classroom_members (
				classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				joined_at INTEGER NOT NULL,
				PRIMARY KEY (classroom_id, user_id)
			)`
		),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON classrooms(teacher_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_classrooms_code ON classrooms(code)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_members_user ON classroom_members(user_id)`)
	]);
	for (const ddl of [
		`ALTER TABLE classrooms ADD COLUMN subject TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE classrooms ADD COLUMN description TEXT NOT NULL DEFAULT ''`
	]) {
		try {
			await db.prepare(ddl).run();
		} catch {
			// oszlop már létezik
		}
	}
}

export function isTeacher(user: PublicUser | null): boolean {
	return user?.role === 'teacher' || user?.role === 'admin';
}

export type MessageRefType = '' | 'subject' | 'lesson' | 'quiz' | 'deck' | 'topic';

export interface MessageRef {
	ref_type: string;
	ref_id: string;
	ref_title: string;
}

export interface ClassMessage {
	id: string;
	classroom_id: string;
	teacher_id: string;
	teacher_name?: string;
	title: string;
	body: string;
	link_url: string | null;
	ref_type: string | null;
	ref_id: string | null;
	ref_title: string | null;
	created_at: number;
	/** Több csatolmány (message_refs tábla); régi üzeneteknél üres. */
	refs?: MessageRef[];
}

export interface ClassTask {
	id: string;
	classroom_id: string;
	teacher_id: string;
	teacher_name?: string;
	title: string;
	lesson_ids_json: string;
	question_count: number;
	target_pct: number;
	shuffle: number;
	due_date: number | null;
	created_at: number;
}

export interface ClassAssignment {
	id: string;
	classroom_id: string;
	teacher_id: string;
	teacher_name?: string;
	title: string;
	description: string;
	due_date: number | null;
	require_text: number;
	min_chars: number;
	require_images: number;
	max_images: number;
	require_files: number;
	max_files: number;
	require_audio: number;
	created_at: number;
}

export interface AssignmentUpload {
	id: string;
	assignment_id: string;
	classroom_id: string;
	user_id: string;
	user_name?: string;
	kind: string;
	r2_key: string;
	file_name: string;
	mime: string;
	size: number;
	width: number | null;
	height: number | null;
	created_at: number;
}

export interface AssignmentSubmission {
	assignment_id: string;
	user_id: string;
	classroom_id: string;
	text_body: string;
	submitted: number;
	submitted_at: number | null;
	updated_at: number;
	/** Tanari ertekeles: erdemjegy 1-5 (null = meg nincs ertekelve). */
	grade: number | null;
	/** Tanari szoveges visszajelzes. */
	feedback: string;
	graded_at: number | null;
	graded_by: string | null;
}

/** Üzenet- és feladattábla önhelyreállító létrehozása. */
export async function ensureClassContentSchema(db: D1Database): Promise<void> {
	await ensureClassroomSchema(db);
	await ensureAssignmentSchema(db);
	await db.batch([
		db.prepare(
			`CREATE TABLE IF NOT EXISTS messages (
				id TEXT PRIMARY KEY,
				classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
				teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				title TEXT NOT NULL,
				body TEXT NOT NULL DEFAULT '',
				link_url TEXT,
				ref_type TEXT,
				ref_id TEXT,
				ref_title TEXT,
				created_at INTEGER NOT NULL
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS classroom_tasks (
				id TEXT PRIMARY KEY,
				classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
				teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				title TEXT NOT NULL DEFAULT '',
				lesson_ids_json TEXT NOT NULL DEFAULT '[]',
				question_count INTEGER NOT NULL DEFAULT 10,
				target_pct INTEGER NOT NULL DEFAULT 80,
				shuffle INTEGER NOT NULL DEFAULT 1,
				due_date INTEGER,
				created_at INTEGER NOT NULL
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS message_refs (
				message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
				ref_type TEXT NOT NULL,
				ref_id TEXT NOT NULL,
				ref_title TEXT NOT NULL DEFAULT '',
				sort INTEGER NOT NULL DEFAULT 0,
				PRIMARY KEY (message_id, ref_type, ref_id)
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS task_submissions (
				task_id TEXT NOT NULL REFERENCES classroom_tasks(id) ON DELETE CASCADE,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				classroom_id TEXT NOT NULL,
				best_score INTEGER NOT NULL DEFAULT 0,
				best_total INTEGER NOT NULL DEFAULT 0,
				best_pct INTEGER NOT NULL DEFAULT 0,
				attempts INTEGER NOT NULL DEFAULT 0,
				submitted INTEGER NOT NULL DEFAULT 0,
				submitted_at INTEGER,
				updated_at INTEGER NOT NULL,
				PRIMARY KEY (task_id, user_id)
			)`
		),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_messages_class ON messages(classroom_id, created_at)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_msg_refs_message ON message_refs(message_id, sort)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_tasks_class ON classroom_tasks(classroom_id, created_at)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_submissions_task ON task_submissions(task_id)`)
	]);
	try {
		await db.prepare(`ALTER TABLE messages ADD COLUMN ref_title TEXT`).run();
	} catch {
		// oszlop már létezik
	}
}

/** Beadandó-táblák önhelyreállító létrehozása (meghívja az ensureClassContentSchema is). */
export async function ensureAssignmentSchema(db: D1Database): Promise<void> {
	await ensureClassroomSchema(db);
	await db.batch([
		db.prepare(
			`CREATE TABLE IF NOT EXISTS classroom_assignments (
				id TEXT PRIMARY KEY,
				classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
				teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				title TEXT NOT NULL DEFAULT '',
				description TEXT NOT NULL DEFAULT '',
				due_date INTEGER,
				require_text INTEGER NOT NULL DEFAULT 1,
				min_chars INTEGER NOT NULL DEFAULT 0,
				require_images INTEGER NOT NULL DEFAULT 0,
				max_images INTEGER NOT NULL DEFAULT 3,
				require_files INTEGER NOT NULL DEFAULT 0,
				max_files INTEGER NOT NULL DEFAULT 5,
				require_audio INTEGER NOT NULL DEFAULT 0,
				created_at INTEGER NOT NULL
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS assignment_submissions (
				assignment_id TEXT NOT NULL REFERENCES classroom_assignments(id) ON DELETE CASCADE,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				classroom_id TEXT NOT NULL,
				text_body TEXT NOT NULL DEFAULT '',
				submitted INTEGER NOT NULL DEFAULT 0,
				submitted_at INTEGER,
				updated_at INTEGER NOT NULL,
				PRIMARY KEY (assignment_id, user_id)
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS assignment_uploads (
				id TEXT PRIMARY KEY,
				assignment_id TEXT NOT NULL REFERENCES classroom_assignments(id) ON DELETE CASCADE,
				classroom_id TEXT NOT NULL,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				kind TEXT NOT NULL DEFAULT 'file',
				r2_key TEXT NOT NULL UNIQUE,
				file_name TEXT NOT NULL DEFAULT '',
				mime TEXT NOT NULL DEFAULT '',
				size INTEGER NOT NULL DEFAULT 0,
				width INTEGER,
				height INTEGER,
				created_at INTEGER NOT NULL
			)`
		),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_assignments_class ON classroom_assignments(classroom_id, created_at)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_assignment_subs_assignment ON assignment_submissions(assignment_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_assignment_uploads_lookup ON assignment_uploads(assignment_id, user_id, created_at)`)
	]);
	for (const ddl of [
		`ALTER TABLE classroom_assignments ADD COLUMN require_audio INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE assignment_submissions ADD COLUMN grade INTEGER`,
		`ALTER TABLE assignment_submissions ADD COLUMN feedback TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE assignment_submissions ADD COLUMN graded_at INTEGER`,
		`ALTER TABLE assignment_submissions ADD COLUMN graded_by TEXT`
	]) {
		try {
			await db.prepare(ddl).run();
		} catch {
			// oszlop mar letezik
		}
	}
}

/** Jelszo-reset tokenek + web push feliratkozasok + app beallitasok (VAPID kulcs).
 *  Onhelyreallito: a 0026 migracio nelkul is mukodik. */
export async function ensureSecuritySchema(db: D1Database): Promise<void> {
	await db.batch([
		db.prepare(
			`CREATE TABLE IF NOT EXISTS password_reset_tokens (
				token TEXT PRIMARY KEY,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				email TEXT NOT NULL,
				code TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				expires_at INTEGER NOT NULL,
				used_at INTEGER,
				attempts INTEGER NOT NULL DEFAULT 0
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS push_subscriptions (
				endpoint TEXT PRIMARY KEY,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				p256dh TEXT NOT NULL,
				auth TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS app_config (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			)`
		),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id, expires_at)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_email ON password_reset_tokens(email, created_at)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)`),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS notification_prefs (
				user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
				messages INTEGER NOT NULL DEFAULT 1,
				tasks INTEGER NOT NULL DEFAULT 1,
				grades INTEGER NOT NULL DEFAULT 1,
				muted_json TEXT NOT NULL DEFAULT '[]',
				updated_at INTEGER NOT NULL
			)`
		)
	]);
	for (const ddl of [
		`ALTER TABLE password_reset_tokens ADD COLUMN code TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE password_reset_tokens ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE notification_prefs ADD COLUMN grades INTEGER NOT NULL DEFAULT 1`
	]) {
		try {
			await db.prepare(ddl).run();
		} catch {
			// oszlop mar letezik
		}
	}
}

/** Csatolmányok üzenetenként (message_refs). Régi DB-n üres map. */
export async function getMessageRefs(
	db: D1Database,
	messageIds: string[]
): Promise<Map<string, MessageRef[]>> {
	const out = new Map<string, MessageRef[]>();
	if (messageIds.length === 0) return out;
	try {
		const refs = await db
			.prepare(
				`SELECT message_id, ref_type, ref_id, ref_title FROM message_refs
				 WHERE message_id IN (${messageIds.map(() => '?').join(',')}) ORDER BY sort`
			)
			.bind(...messageIds)
			.all<{ message_id: string; ref_type: string; ref_id: string; ref_title: string }>();
		for (const r of refs.results ?? []) {
			const list = out.get(r.message_id) ?? [];
			list.push({ ref_type: r.ref_type, ref_id: r.ref_id, ref_title: r.ref_title ?? '' });
			out.set(r.message_id, list);
		}
	} catch {
		// message_refs nélkül is megy (régi DB)
	}
	return out;
}

/** 6 karakteres, könnyen diktálható kód (összetéveszthető karakterek nélkül). */
export function generateClassCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	let out = '';
	for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
	return out;
}

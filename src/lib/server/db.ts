import type { D1Database } from '@cloudflare/workers-types';
import type { RequestEvent } from '@sveltejs/kit';

export interface DbUser {
	id: string;
	name: string;
	email: string;
	pass_hash: string;
	salt: string;
	created_at: number;
	role?: string;
	xp?: number;
	streak?: number;
}

export interface PublicUser {
	id: string;
	name: string;
	email: string;
	role: string;
	xp: number;
	streak: number;
}

export const SESSION_COOKIE = 'leardy_session';
const SESSION_DAYS = 30;

export function getDb(event: RequestEvent): D1Database | null {
	try {
		return event.platform?.env?.DB ?? null;
	} catch {
		return null;
	}
}

/**
 * Önhelyreállító séma: ha a lokális D1 fájl friss/wipelt (.wrangler/state törlődött),
 * a táblák akkor is létrejönnek, nem kell kézzel migrálni dev-ben.
 * A CREATE TABLE IF NOT EXISTS idempotens, élesben is biztonságos.
 * Lefedi az auth + core (Topic/Lesson/SRS/tanári) sémát is.
 */
export async function ensureAuthSchema(db: D1Database): Promise<void> {
	await db.batch([
		db.prepare(
			`CREATE TABLE IF NOT EXISTS users (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				email TEXT NOT NULL UNIQUE,
				pass_hash TEXT NOT NULL,
				salt TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				role TEXT NOT NULL DEFAULT 'student',
				xp INTEGER NOT NULL DEFAULT 0,
				streak INTEGER NOT NULL DEFAULT 0,
				last_study_date TEXT NOT NULL DEFAULT ''
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS sessions (
				token TEXT PRIMARY KEY,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				created_at INTEGER NOT NULL,
				expires_at INTEGER NOT NULL
			)`
		),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`)
	]);
	// Meglévő (régi sémájú) users tábla bővítése — ha az oszlop már létezik, a D1 hibát dob, azt elnyeljük.
	for (const ddl of [
		`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'`,
		`ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE users ADD COLUMN streak INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE users ADD COLUMN last_study_date TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE classrooms ADD COLUMN subject TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE assignments ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE assignments ADD COLUMN time_limit_mins INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE assignments ADD COLUMN shuffle INTEGER NOT NULL DEFAULT 1`,
		`ALTER TABLE assignments ADD COLUMN feedback_delayed INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE assignments ADD COLUMN is_exam INTEGER NOT NULL DEFAULT 0`
	]) {
		try {
			await db.prepare(ddl).run();
		} catch {
			// oszlop már létezik
		}
	}
	await db.batch([
		db.prepare(
			`CREATE TABLE IF NOT EXISTS classrooms (
				id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '',
				created_at INTEGER NOT NULL
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS classroom_members (
				classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				joined_at INTEGER NOT NULL, PRIMARY KEY (classroom_id, user_id)
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS topics (
				id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Humán',
				type TEXT NOT NULL DEFAULT 'general', is_public INTEGER NOT NULL DEFAULT 1,
				author_id TEXT REFERENCES users(id) ON DELETE SET NULL, created_at INTEGER NOT NULL
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS enrollments (
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
				enrolled_at INTEGER NOT NULL, PRIMARY KEY (user_id, topic_id)
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS lessons (
				id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
				order_index INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL,
				description_markdown TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS flashcards (
				id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
				front_text TEXT NOT NULL, back_text TEXT NOT NULL,
				audio_url TEXT, image_url TEXT, ipa TEXT
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS quiz_questions (
				id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
				question_text TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'choice',
				options_json TEXT NOT NULL DEFAULT '[]', correct_answer TEXT NOT NULL DEFAULT ''
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS user_progress (
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				flashcard_id TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
				ease_interval INTEGER NOT NULL DEFAULT 0, next_review_date TEXT NOT NULL DEFAULT '',
				status TEXT NOT NULL DEFAULT 'new', updated_at INTEGER NOT NULL DEFAULT 0,
				PRIMARY KEY (user_id, flashcard_id)
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS lesson_progress (
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
				theory_done INTEGER NOT NULL DEFAULT 0, cards_done INTEGER NOT NULL DEFAULT 0,
				quiz_done INTEGER NOT NULL DEFAULT 0, quiz_best INTEGER NOT NULL DEFAULT 0,
				updated_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, lesson_id)
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS activity (
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				day TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, reviews INTEGER NOT NULL DEFAULT 0,
				PRIMARY KEY (user_id, day)
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS assessments (
				id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE, title TEXT NOT NULL,
				max_attempts INTEGER NOT NULL DEFAULT 0, time_limit_mins INTEGER NOT NULL DEFAULT 0,
				shuffle INTEGER NOT NULL DEFAULT 1, feedback_delayed INTEGER NOT NULL DEFAULT 0,
				is_exam INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS assessment_items (
				id TEXT PRIMARY KEY, assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
				question_text TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'choice',
				options_json TEXT NOT NULL DEFAULT '[]', correct_answer TEXT NOT NULL DEFAULT '',
				order_index INTEGER NOT NULL DEFAULT 0
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS assignments (
				id TEXT PRIMARY KEY, assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
				classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
				start_date INTEGER NOT NULL DEFAULT 0, due_date INTEGER NOT NULL DEFAULT 0,
				max_attempts INTEGER NOT NULL DEFAULT 0, time_limit_mins INTEGER NOT NULL DEFAULT 0,
				shuffle INTEGER NOT NULL DEFAULT 1, feedback_delayed INTEGER NOT NULL DEFAULT 0,
				is_exam INTEGER NOT NULL DEFAULT 0
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS submissions (
				id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
				student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				score INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
				started_at INTEGER NOT NULL DEFAULT 0, submitted_at INTEGER NOT NULL DEFAULT 0,
				answers_json TEXT NOT NULL DEFAULT '{}'
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS exam_attempts (
				id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
				score INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
				mistakes_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
			)`
		),
		db.prepare(
			`CREATE TABLE IF NOT EXISTS messages (
				id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
				teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
				link_url TEXT, ref_type TEXT, ref_id TEXT, created_at INTEGER NOT NULL
			)`
		)
	]);
	await db.batch([
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_lessons_topic ON lessons(topic_id, order_index)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_cards_lesson ON flashcards(lesson_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_quiz_lesson ON quiz_questions(lesson_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id, next_review_date)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_topics_public ON topics(is_public, category)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_members_user ON classroom_members(user_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_assign_class ON assignments(classroom_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_subm_assign ON submissions(assignment_id, student_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_exam_user_topic ON exam_attempts(user_id, topic_id, created_at)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_messages_class ON messages(classroom_id, created_at)`)
	]);
}

export function makeSalt(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string, salt: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(`${salt}::${password}`)
	);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function publicUser(u: DbUser): PublicUser {
	return {
		id: u.id,
		name: u.name,
		email: u.email,
		role: (u as Partial<PublicUser>).role ?? 'student',
		xp: (u as Partial<PublicUser>).xp ?? 0,
		streak: (u as Partial<PublicUser>).streak ?? 0
	};
}

function secureCookie(event: RequestEvent): boolean {
	try {
		return new URL(event.request.url).protocol === 'https:';
	} catch {
		return false;
	}
}

export async function createSession(
	event: RequestEvent,
	db: D1Database,
	userId: string
): Promise<string> {
	const token = randomToken();
	const now = Date.now();
	await db
		.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
		.bind(token, userId, now, now + SESSION_DAYS * 24 * 3600 * 1000)
		.run();
	event.cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: secureCookie(event),
		maxAge: SESSION_DAYS * 24 * 3600
	});
	return token;
}

export async function getSessionUser(
	event: RequestEvent,
	db: D1Database
): Promise<PublicUser | null> {
	const token = event.cookies.get(SESSION_COOKIE);
	if (!token) return null;
	const row = await db
		.prepare(
			`SELECT u.id, u.name, u.email,
				COALESCE(u.role, 'student') AS role,
				COALESCE(u.xp, 0) AS xp,
				COALESCE(u.streak, 0) AS streak
			 FROM sessions s
			 JOIN users u ON u.id = s.user_id
			 WHERE s.token = ? AND s.expires_at > ?`
		)
		.bind(token, Date.now())
		.first<PublicUser>();
	return row ?? null;
}

/** Bejelentkezett user, vagy null. Minden védett végpont belépési pontja. */
export async function requireUser(
	event: RequestEvent,
	db: D1Database
): Promise<PublicUser | null> {
	return getSessionUser(event, db);
}

// ---------- SRS (2 gombos Leitner) ----------

/** Ismétlési intervallumok napokban: Tudom -> továbblép, Nem tudom -> vissza 1-re. */
export const SRS_INTERVALS = [1, 3, 7, 14, 30] as const;

/** Nap-határ magyar idő szerint — devben és Cloudflare Workersen (UTC) is ugyanaz. */
const HU_DAY_FMT = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Europe/Budapest',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

export function todayStr(offsetDays = 0): string {
	return HU_DAY_FMT.format(new Date(Date.now() + offsetDays * 24 * 3600 * 1000));
}

export function nextSrsInterval(current: number, known: boolean): number {
	if (!known) return 1;
	if (current <= 0) return 1;
	const i = SRS_INTERVALS.indexOf(current as (typeof SRS_INTERVALS)[number]);
	if (i < 0) return 1;
	return SRS_INTERVALS[Math.min(i + 1, SRS_INTERVALS.length - 1)];
}

// ---------- XP / széria ----------

export async function logActivity(
	db: D1Database,
	userId: string,
	xpGain: number,
	reviewsGain = 0
): Promise<{ xp: number; streak: number }> {
	const today = todayStr();
	const yesterday = todayStr(-1);
	const u = await db
		.prepare(
			`SELECT xp, streak, COALESCE(last_study_date, '') AS last_study_date, COALESCE(role, 'student') AS role
			 FROM users WHERE id = ?`
		)
		.bind(userId)
		.first<{ xp: number; streak: number; last_study_date: string; role: string }>();
	if ((u?.role ?? 'student') === 'teacher') {
		// Tanár nem gyűjt XP-t: csak az ismétlésszámot naplózzuk, XP/széria változatlan.
		await db
			.prepare(
				`INSERT INTO activity (user_id, day, xp, reviews) VALUES (?, ?, 0, ?)
				 ON CONFLICT(user_id, day) DO UPDATE SET reviews = reviews + excluded.reviews`
			)
			.bind(userId, today, reviewsGain)
			.run();
		return { xp: u?.xp ?? 0, streak: u?.streak ?? 0 };
	}
	await db
		.prepare(
			`INSERT INTO activity (user_id, day, xp, reviews) VALUES (?, ?, ?, ?)
			 ON CONFLICT(user_id, day) DO UPDATE SET xp = xp + excluded.xp, reviews = reviews + excluded.reviews`
		)
		.bind(userId, today, xpGain, reviewsGain)
		.run();
	const xp = (u?.xp ?? 0) + xpGain;
	let streak = u?.streak ?? 0;
	const last = u?.last_study_date ?? '';
	if (last !== today) {
		streak = last === yesterday ? streak + 1 : 1;
		await db
			.prepare(`UPDATE users SET xp = ?, streak = ?, last_study_date = ? WHERE id = ?`)
			.bind(xp, streak, today, userId)
			.run();
	} else {
		await db.prepare(`UPDATE users SET xp = ? WHERE id = ?`).bind(xp, userId).run();
	}
	return { xp, streak };
}

// ---------- Apró helperek ----------

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeClassCode(length = 6): string {
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

export function newId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
	}
}

export async function destroySession(event: RequestEvent, db: D1Database): Promise<void> {
	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
	}
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
}

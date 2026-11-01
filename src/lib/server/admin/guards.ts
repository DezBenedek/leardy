// Szerver oldali admin őrök és séma bővítés.
// Minden védett admin végpont belépési pontja.

import type { D1Database, RequestEvent } from '$lib/server/infra/db';
import { getDb, requireUser, type PublicUser } from '$lib/server/infra/db';
import { error } from '@sveltejs/kit';
import { canAssignRoles, canModerate, canViewSchoolStats, hasMinRole, type Role } from '$lib/admin/roles';

export interface AdminUser extends PublicUser {
	suspended_until?: number;
	muted_until?: number;
}

/** Séma bővítés tiltáshoz és naplóhoz. Idempotens, élesben is biztonságos. */
export async function ensureAdminSchema(db: D1Database): Promise<void> {
	await db
		.prepare(
			`CREATE TABLE IF NOT EXISTS admin_actions (
				id TEXT PRIMARY KEY,
				actor_id TEXT NOT NULL,
				target_id TEXT,
				action TEXT NOT NULL,
				reason TEXT NOT NULL DEFAULT '',
				expires_at INTEGER,
				created_at INTEGER NOT NULL
			)`
		)
		.run();
	for (const ddl of [
		`ALTER TABLE users ADD COLUMN suspended_until INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE users ADD COLUMN muted_until INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE users ADD COLUMN suspended_reason TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE users ADD COLUMN muted_reason TEXT NOT NULL DEFAULT ''`
	]) {
		try {
			await db.prepare(ddl).run();
		} catch {
			// oszlop már létezik
		}
	}
	for (const idx of [
		`CREATE INDEX IF NOT EXISTS idx_admin_actions_actor ON admin_actions(actor_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON admin_actions(target_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`
	]) {
		try {
			await db.prepare(idx).run();
		} catch {
			// index már létezik
		}
	}
}

async function loadAdminUser(event: RequestEvent, db: D1Database): Promise<AdminUser | null> {
	const user = await requireUser(event, db);
	if (!user) return null;
	try {
		const row = await db
			.prepare(`SELECT COALESCE(suspended_until, 0) AS suspended_until, COALESCE(muted_until, 0) AS muted_until FROM users WHERE id = ?`)
			.bind(user.id)
			.first<{ suspended_until: number; muted_until: number }>();
		return { ...user, suspended_until: row?.suspended_until ?? 0, muted_until: row?.muted_until ?? 0 };
	} catch {
		return user;
	}
}

/** Tiltott fiók nem léphet be és nem hívhat védett végpontot. */
export function ensureNotSuspended(user: AdminUser, now = Date.now()): void {
	if ((user.suspended_until ?? 0) > now) {
		error(403, 'A fiókod ideiglenesen fel van függesztve. Vedd fel a kapcsolatot az iskoláddal.');
	}
}

/** Némított fiók olvashat, de nem írhat. Admin és fejlesztő mentesül. */
export function ensureWritable(user: AdminUser, now = Date.now()): void {
	const privileged = user.role === 'admin' || user.role === 'developer' || !!user.is_admin;
	if (privileged) return;
	if ((user.muted_until ?? 0) > now) {
		error(403, 'A fiókod ideiglenesen némítva van, ezért most nem módosíthatsz.');
	}
}

/** Legalább az elvárt szerep kell. Admin és fejlesztő mindent átlép. */
export async function requireAdminRole(event: RequestEvent, min: Role): Promise<{ db: D1Database; user: AdminUser }> {
	const db = getDb(event);
	if (!db) error(503, 'Az adatbázis most nem elérhető.');
	await ensureAdminSchema(db);
	const user = await loadAdminUser(event, db);
	if (!user) error(401, 'A folytatáshoz jelentkezz be.');
	ensureNotSuspended(user);
	if (user.is_admin && (min === 'school_leader' || min === 'admin')) return { db, user };
	if (!hasMinRole(user.role, min)) error(403, 'Ehhez nincs jogosultságod.');
	return { db, user };
}

export async function requireSchoolStats(event: RequestEvent): Promise<{ db: D1Database; user: AdminUser }> {
	const { db, user } = await requireAdminRole(event, 'school_leader');
	if (!canViewSchoolStats(user.role, user.is_admin)) error(403, 'Ehhez nincs jogosultságod.');
	if (!user.school_id) error(403, 'Nincs iskolához rendelve a fiókod.');
	return { db, user };
}

export async function requireModerator(event: RequestEvent): Promise<{ db: D1Database; user: AdminUser }> {
	const { db, user } = await requireAdminRole(event, 'admin');
	if (!canModerate(user.role, user.is_admin)) error(403, 'Ehhez nincs jogosultságod.');
	return { db, user };
}

export async function requireDeveloper(event: RequestEvent): Promise<{ db: D1Database; user: AdminUser }> {
	const db = getDb(event);
	if (!db) error(503, 'Az adatbázis most nem elérhető.');
	await ensureAdminSchema(db);
	const user = await loadAdminUser(event, db);
	if (!user) error(401, 'A folytatáshoz jelentkezz be.');
	ensureNotSuspended(user);
	if (canAssignRoles(user.role)) return { db, user };
	// Bootstrap: amíg egy fejlesztő sincs, a régi is_admin fiók egyszeri kivételként oszthat.
	const devs = await db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'developer'`).first<{ n: number }>().catch(() => ({ n: 1 }));
	if ((devs?.n ?? 1) === 0 && user.is_admin) return { db, user };
	error(403, 'Ehhez fejlesztői jog kell.');
}

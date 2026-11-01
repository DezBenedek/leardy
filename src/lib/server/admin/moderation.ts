// Moderálás: keresés, tiltás, némítás és naplózás.
// Két külön szint: ban (belépés tiltás) és mute (csak írás tiltás).

import type { D1Database } from '@cloudflare/workers-types';
import { normalizeRole, roleRank } from '$lib/admin/roles';

export type RestrictKind = 'ban' | 'mute';

export interface AdminUserRow {
	id: string;
	name: string;
	email: string;
	role: string;
	school_id: string;
	suspended_until: number;
	muted_until: number;
	suspended_reason: string;
	muted_reason: string;
}

export async function searchUsers(
	db: D1Database,
	query: string,
	role: string,
	onlyRestricted: boolean,
	limit = 30,
	offset = 0
): Promise<{ items: AdminUserRow[]; total: number }> {
	const filters: string[] = [];
	const args: unknown[] = [];
	if (query.trim()) {
		filters.push(`(instr(lower(name), ?) > 0 OR instr(lower(email), ?) > 0)`);
		const needle = query.trim().toLowerCase();
		args.push(`%${needle}%`, `%${needle}%`);
	}
	if (role && role !== 'all') {
		filters.push(`role = ?`);
		args.push(role);
	}
	if (onlyRestricted) {
		filters.push(`(COALESCE(suspended_until, 0) > ? OR COALESCE(muted_until, 0) > ?)`);
		args.push(Date.now(), Date.now());
	}
	const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
	const total = await db
		.prepare(`SELECT COUNT(*) AS n FROM users ${where}`)
		.bind(...args)
		.first<{ n: number }>()
		.catch(() => ({ n: 0 }));
	const rows = await db
		.prepare(
			`SELECT id, name, email, COALESCE(role, 'student') AS role, COALESCE(school_id, '') AS school_id,
				COALESCE(suspended_until, 0) AS suspended_until, COALESCE(muted_until, 0) AS muted_until,
				COALESCE(suspended_reason, '') AS suspended_reason, COALESCE(muted_reason, '') AS muted_reason
			 FROM users ${where} ORDER BY name LIMIT ? OFFSET ?`
		)
		.bind(...args, limit, offset)
		.all<AdminUserRow>()
		.catch(() => ({ results: [] }));
	return { total: total?.n ?? 0, items: rows.results ?? [] };
}

export async function restrictUser(
	db: D1Database,
	actorId: string,
	actorRole: unknown,
	targetId: string,
	kind: RestrictKind,
	days: number,
	reason: string
): Promise<{ expiresAt: number }> {
	const clean = reason.trim().slice(0, 300);
	if (!clean) throw new Error('Indok kötelező.');
	if (!Number.isFinite(days) || days < 1 || days > 365) throw new Error('Időtartam 1 és 365 nap között lehet.');
	const target = await db
		.prepare(`SELECT id, role FROM users WHERE id = ?`)
		.bind(targetId)
		.first<{ id: string; role: string }>();
	if (!target) throw new Error('Nincs ilyen felhasználó.');
	if (target.role === 'developer') throw new Error('Fejlesztő nem tiltható.');
	// Senki nem korlátozhat vele egyenlő vagy magasabb szerepet.
	if (roleRank(target.role) >= roleRank(normalizeRole(actorRole))) {
		throw new Error('Vele egyenlő vagy magasabb szerepet nem korlátozhatsz.');
	}
	const expiresAt = Date.now() + Math.round(days * 24 * 3600 * 1000);
	if (kind === 'ban') {
		await db.prepare(`UPDATE users SET suspended_until = ?, suspended_reason = ? WHERE id = ?`).bind(expiresAt, clean, targetId).run();
		// Azonnali kirúgás: a meglévő munkamenetek érvénytelenek.
		try {
			await db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(targetId).run();
		} catch {
			// nem kritikus
		}
	} else {
		await db.prepare(`UPDATE users SET muted_until = ?, muted_reason = ? WHERE id = ?`).bind(expiresAt, clean, targetId).run();
	}
	await db
		.prepare(`INSERT INTO admin_actions (id, actor_id, target_id, action, reason, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
		.bind(crypto.randomUUID(), actorId, targetId, kind, clean, expiresAt, Date.now())
		.run();
	return { expiresAt };
}

export async function unrestrictUser(db: D1Database, actorId: string, targetId: string, kind: RestrictKind): Promise<void> {
	if (kind === 'ban') {
		await db.prepare(`UPDATE users SET suspended_until = 0, suspended_reason = '' WHERE id = ?`).bind(targetId).run();
	} else {
		await db.prepare(`UPDATE users SET muted_until = 0, muted_reason = '' WHERE id = ?`).bind(targetId).run();
	}
	await db
		.prepare(`INSERT INTO admin_actions (id, actor_id, target_id, action, reason, expires_at, created_at) VALUES (?, ?, ?, ?, '', NULL, ?)`)
		.bind(crypto.randomUUID(), actorId, targetId, kind === 'ban' ? 'unban' : 'unmute', Date.now())
		.run();
}

export async function recentActions(
	db: D1Database,
	limit = 20,
	offset = 0
): Promise<{ id: string; actor: string; target: string; action: string; reason: string; createdAt: number }[]> {
	const rows = await db
		.prepare(
			`SELECT a.id, COALESCE(u1.name, a.actor_id) AS actor, COALESCE(u2.name, a.target_id) AS target,
				a.action, a.reason, a.created_at AS created_at
			 FROM admin_actions a LEFT JOIN users u1 ON u1.id = a.actor_id LEFT JOIN users u2 ON u2.id = a.target_id
			 ORDER BY a.created_at DESC LIMIT ? OFFSET ?`
		)
		.bind(limit, offset)
		.all<{ id: string; actor: string; target: string; action: string; reason: string; createdAt: number }>()
		.catch(() => ({ results: [] }));
	return (rows.results ?? []).map((r) => ({ id: r.id, actor: r.actor, target: r.target, action: r.action, reason: r.reason, createdAt: r.created_at }));
}

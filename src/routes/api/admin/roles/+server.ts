import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { requireDeveloper } from '$lib/server/admin/guards';
import { normalizeRole, ROLES } from '$lib/admin/roles';

export const POST: RequestHandler = async (event) => {
	try {
		const { db, user } = await requireDeveloper(event);
		const body = (await event.request.json().catch(() => ({}))) as { email?: string; role?: string };
		const email = String(body.email ?? '').trim().toLowerCase().slice(0, 254);
		const role = normalizeRole(body.role);
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Adj meg érvényes e-mail-címet.' }, { status: 400 });
		if (!ROLES.includes(role) || role === 'student' || role === 'teacher') {
			return json({ error: 'Diák és tanár szerep automatikus, csak vezető, admin és fejlesztő osztható.' }, { status: 400 });
		}
		if (email === user.email.trim().toLowerCase()) return json({ error: 'A saját szereped nem változtathatod itt.' }, { status: 400 });
		const target = await db.prepare(`SELECT id, role FROM users WHERE lower(email) = ?`).bind(email).first<{ id: string; role: string }>();
		if (!target) return json({ error: 'Ezzel az e-mail-címmel nincs regisztrált felhasználó.' }, { status: 404 });
		const isDeveloper = target.role === 'developer';
		const existingDevs = await db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'developer'`).bind().first<{ n: number }>().catch(() => ({ n: 1 }));
		if (isDeveloper && role !== 'developer' && (existingDevs?.n ?? 1) <= 1) {
			return json({ error: 'Az utolsó fejlesztőt nem fokozhatod le.' }, { status: 400 });
		}
		await db.prepare(`UPDATE users SET role = ?, is_admin = ? WHERE id = ?`).bind(role, role === 'admin' || role === 'developer' ? 1 : 0, target.id).run();
		await db
			.prepare(`INSERT INTO admin_actions (id, actor_id, target_id, action, reason, expires_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)`)
			.bind(crypto.randomUUID(), user.id, target.id, `role:${role}`, '', Date.now())
			.run()
			.catch(() => {});
		return json({ ok: true });
	} catch (e) {
		const status = (e as { status?: number })?.status ?? 500;
		return json({ error: e instanceof Error ? e.message : 'Hiba történt.' }, { status });
	}
};

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { roleRank } from '$lib/admin/roles';
import { requireModerator } from '$lib/server/admin/guards';
import { restrictUser, searchUsers, unrestrictUser } from '$lib/server/admin/moderation';

export const GET: RequestHandler = async (event) => {
	try {
		const { db } = await requireModerator(event);
		const q = event.url.searchParams.get('q')?.slice(0, 100) ?? '';
		const role = event.url.searchParams.get('role')?.slice(0, 30) ?? 'all';
		const onlyRestricted = event.url.searchParams.get('restricted') === '1';
		const limit = Math.min(Math.max(Number(event.url.searchParams.get('limit') ?? 30) || 30, 5), 100);
		const offset = Math.max(Number(event.url.searchParams.get('offset') ?? 0) || 0, 0);
		return json(await searchUsers(db, q, role, onlyRestricted, limit, offset));
	} catch (e) {
		const status = (e as { status?: number })?.status ?? 500;
		return json({ error: e instanceof Error ? e.message : 'Hiba történt.' }, { status });
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const { db, user } = await requireModerator(event);
		const body = (await event.request.json().catch(() => ({}))) as {
			targetId?: string; kind?: string; days?: number; reason?: string; action?: string;
		};
		if (body.action === 'unrestrict') {
			if (typeof body.targetId !== 'string' || (body.kind !== 'ban' && body.kind !== 'mute')) {
				return json({ error: 'Hiányzó adat.' }, { status: 400 });
			}
			if (body.targetId === user.id) return json({ error: 'Magadat nem oldhatod fel.' }, { status: 400 });
			await unrestrictUser(db, user.id, body.targetId, body.kind);
			return json({ ok: true });
		}
		if (typeof body.targetId !== 'string' || (body.kind !== 'ban' && body.kind !== 'mute')) {
			return json({ error: 'Hiányzó adat.' }, { status: 400 });
		}
		if (body.targetId === user.id) return json({ error: 'Magadat nem tilthatod.' }, { status: 400 });
		// Régi is_admin jelölés átmenetként admin rangnak számít.
		const actorRole = user.is_admin && roleRank(user.role) < roleRank('admin') ? 'admin' : user.role;
		const result = await restrictUser(db, user.id, actorRole, body.targetId, body.kind, Number(body.days ?? 7), String(body.reason ?? ''));
		return json({ ok: true, ...result });
	} catch (e) {
		const status = (e as { status?: number })?.status ?? 500;
		return json({ error: e instanceof Error ? e.message : 'Hiba történt.' }, { status });
	}
};

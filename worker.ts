import type { DurableObjectNamespace, ExportedHandler } from '@cloudflare/workers-types';
// A SvelteKit által előállított HTTP-kezelő a build után érhető el.
// @ts-expect-error A generált JavaScript-modulhoz nincs típusdeklaráció.
import app from './.svelte-kit/cloudflare/_worker.js';
import { runPushSchedule } from './src/lib/server/messaging/push-scheduler';
import { LiveRoom } from './src/lib/server/live/live-do';

export { LiveRoom };

interface SocketDb {
	prepare: (q: string) => {
		bind: (...v: unknown[]) => { first: <T>() => Promise<T | null> };
	};
}

interface SocketAuth {
	ok: boolean;
	status?: number;
	error?: string;
	userId?: string;
	name?: string;
	role?: string;
	mutedUntil?: number;
}

/** Élő socket hitelesítés a peremen: munkamenet, tiltás, tagság, szerep.
 *  A kliens által küldött userId/name/role nem megbízható, mindent felülbélyegzünk. */
async function authorizeLiveSocket(db: SocketDb | undefined, liveId: string, request: Request): Promise<SocketAuth> {
	const fail = (status: number, error: string): SocketAuth => ({ ok: false, status, error });
	if (!db) return fail(503, 'Az adatbázis most nem elérhető.');
	const cookie = request.headers.get('cookie') ?? '';
	const token = cookie
		.split(';')
		.map((c) => c.trim())
		.find((c) => c.startsWith('leardy_session='))
		?.slice('leardy_session='.length);
	if (!token) return fail(401, 'A folytatáshoz jelentkezz be.');
	let user: {
		id: string; name: string; role: string; is_admin: number;
		suspended_until: number; muted_until: number;
	} | null = null;
	try {
		user = await db
			.prepare(
				`SELECT u.id, u.name,
					COALESCE(u.role, 'student') AS role,
					COALESCE(u.is_admin, 0) AS is_admin,
					COALESCE(u.suspended_until, 0) AS suspended_until,
					COALESCE(u.muted_until, 0) AS muted_until
				 FROM sessions s JOIN users u ON u.id = s.user_id
				 WHERE s.token = ? AND s.expires_at > ?`
			)
			.bind(token, Date.now())
			.first();
	} catch {
		// Régi séma a 0015-ös migráció előtt: tiltó oszlopok nélkül.
		try {
			const legacy = await db
				.prepare(
					`SELECT u.id, u.name,
						COALESCE(u.role, 'student') AS role,
						COALESCE(u.is_admin, 0) AS is_admin
					 FROM sessions s JOIN users u ON u.id = s.user_id
					 WHERE s.token = ? AND s.expires_at > ?`
				)
				.bind(token, Date.now())
				.first<{ id: string; name: string; role: string; is_admin: number }>();
			if (legacy) {
				user = { ...legacy, suspended_until: 0, muted_until: 0 };
			}
		} catch {
			return fail(503, 'Az adatbázis most nem elérhető.');
		}
	}
	if (!user) return fail(401, 'A folytatáshoz jelentkezz be.');
	if (user.suspended_until > Date.now()) {
		return fail(403, 'A fiókod ideiglenesen fel van függesztve.');
	}
	let classroomId = '';
	try {
		const session = await db
			.prepare(`SELECT classroom_id FROM live_sessions WHERE id = ?`)
			.bind(liveId)
			.first<{ classroom_id: string }>();
		if (!session) return fail(404, 'Nincs ilyen dolgozat.');
		classroomId = session.classroom_id;
	} catch {
		return fail(503, 'Az adatbázis most nem elérhető.');
	}
	let teacherId = '';
	try {
		const room = await db
			.prepare(`SELECT teacher_id FROM classrooms WHERE id = ?`)
			.bind(classroomId)
			.first<{ teacher_id: string }>();
		if (!room) return fail(404, 'Nincs ilyen osztály.');
		teacherId = room.teacher_id;
	} catch {
		return fail(503, 'Az adatbázis most nem elérhető.');
	}
	const privileged = user.role === 'admin' || user.role === 'developer' || !!user.is_admin;
	const isTeacher = teacherId === user.id;
	if (!isTeacher && !privileged) {
		try {
			const member = await db
				.prepare(`SELECT user_id FROM classroom_members WHERE classroom_id = ? AND user_id = ?`)
				.bind(classroomId, user.id)
				.first<{ user_id: string }>();
			if (!member) return fail(403, 'Nem vagy az osztály tagja.');
		} catch {
			return fail(503, 'Az adatbázis most nem elérhető.');
		}
	}
	const mutedUntil = !privileged && user.muted_until > Date.now() ? user.muted_until : 0;
	return {
		ok: true,
		userId: user.id,
		name: user.name || 'Diák',
		role: isTeacher || privileged ? 'teacher' : 'student',
		mutedUntil
	};
}

export default {
	async fetch(request, env, ctx) {
		try {
			const url = new URL(request.url);
			if (url.pathname.startsWith('/api/live/socket/')) {
				const id = url.pathname.split('/').filter(Boolean).pop() ?? 'elo';
				const ns = (env as unknown as { LIVE?: DurableObjectNamespace }).LIVE;
				if (!ns) {
					return new Response(JSON.stringify({ error: 'Az élő modul nem elérhető.' }), {
						status: 503,
						headers: { 'content-type': 'application/json' }
					});
				}
				const auth = await authorizeLiveSocket(
					(env as unknown as { DB?: SocketDb }).DB,
					id,
					request
				);
				if (!auth.ok) {
					return new Response(JSON.stringify({ error: auth.error ?? 'Tiltott kérés.' }), {
						status: auth.status ?? 403,
						headers: { 'content-type': 'application/json' }
					});
				}
				// Némított résztvevő közvetlen válaszküldése már a peremen elutasítva.
				// A testet egyszer olvassuk: a join-dúsítás is ugyanebből dolgozik.
				let mutedBody: Record<string, unknown> | null = null;
				if (request.method === 'POST' && auth.mutedUntil) {
					try {
						mutedBody = (await request.clone().json()) as Record<string, unknown>;
						if (String(mutedBody?.type ?? '') === 'answer') {
							return new Response(
								JSON.stringify({ error: 'A fiókod ideiglenesen némítva van, ezért most nem módosíthatsz.' }),
								{ status: 403, headers: { 'content-type': 'application/json' } }
							);
						}
					} catch {
						// érthetetlen testtel mehet tovább a DO-hoz
					}
				}
				// Hiteles identitás a DO felé: a kliens paraméterei nem számítanak.
				const proxied = new URL(request.url);
				proxied.searchParams.set('userId', auth.userId ?? '');
				proxied.searchParams.set('name', auth.name ?? 'Diák');
				proxied.searchParams.set('role', auth.role ?? 'student');
				if (auth.mutedUntil) proxied.searchParams.set('mutedUntil', String(auth.mutedUntil));
				const stub = ns.get(ns.idFromName(id));
				// Némított résztvevő közvetlen csatlakozását a DO térképébe is beírjuk.
				if (request.method === 'POST' && auth.mutedUntil && mutedBody && String(mutedBody.type ?? '') === 'join') {
					const headers = new Headers(request.headers);
					headers.delete('content-length');
					return stub.fetch(
						new Request(proxied.toString(), {
							method: 'POST',
							headers,
							body: JSON.stringify({ ...mutedBody, mutedUntil: auth.mutedUntil })
						})
					);
				}
				return stub.fetch(new Request(proxied.toString(), request));
			}
		} catch {
			// útvonalhiba esetén a SvelteKit válaszol
		}
		return app.fetch(request, env, ctx);
	},
	async scheduled(controller, env) {
		await runPushSchedule(env.DB, controller.scheduledTime);
	}
} satisfies ExportedHandler<Cloudflare.Env>;

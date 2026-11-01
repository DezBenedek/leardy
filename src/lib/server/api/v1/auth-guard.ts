import type { D1Database } from '@cloudflare/workers-types';
import type { RequestHandler } from '@sveltejs/kit';
import { canUsePublicApi, ensureApiKeysSchema, requireApiUser, type ApiAuth } from '$lib/server/auth/api-keys';
import { err } from './http';

export async function auth(event: Parameters<RequestHandler>[0], db: D1Database): Promise<ApiAuth | Response> {
	try {
		await ensureApiKeysSchema(db);
	} catch {
		// séma nélkül is próbálkozunk
	}
	const a = await requireApiUser(event, db);
	if (!a) return err('Hiányzó vagy érvénytelen API kulcs. Használd az Authorization: Bearer ld_... fejlécet.', 401);
	if (!canUsePublicApi(a.user)) return err('A publikus API-hoz tanári vagy kiemelt fiók kell.', 403);
	const muted = (a.user.muted_until ?? 0) > Date.now();
	const privileged = a.user.role === 'admin' || a.user.role === 'developer' || !!a.user.is_admin;
	const method = event.request.method.toUpperCase();
	if (muted && !privileged && method !== 'GET' && method !== 'OPTIONS' && method !== 'HEAD') {
		return err('A fiókod ideiglenesen némítva van, ezért most nem módosíthatsz.', 403);
	}
	return a;
}

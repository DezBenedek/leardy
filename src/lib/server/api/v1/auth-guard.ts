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
	if (!canUsePublicApi(a.user)) return err('A publikus API-hoz tanári fiók kell.', 403);
	return a;
}

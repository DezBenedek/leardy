import { error, type RequestEvent } from '@sveltejs/kit';
import { getDb } from './db';

export async function fingerprint(value: unknown): Promise<string> {
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
	return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Kizárólag nyilvános adat. A verziót mindig az elsődleges D1-ről olvassuk. */
export async function publicContent<T>(event: RequestEvent, key: string, subjectId: string | null, load: () => Promise<T>): Promise<{ data: T; version: number }> {
	const db = getDb(event);
	if (!db) error(503, 'Az adatbázis most nem elérhető.');
	const scope = subjectId ? `subject:${subjectId}` : 'catalog';
	const revision = await db.prepare('SELECT revision FROM curriculum_revisions WHERE scope = ?').bind(scope).first<{ revision: number }>();
	const version = revision?.revision ?? 0;
	const url = new URL(`/__content-cache/v1/${encodeURIComponent(key)}`, event.url.origin);
	url.searchParams.set('scope', scope);
	url.searchParams.set('version', String(version));
	const cache = event.platform?.caches?.default;
	if (cache) {
		try {
			const hit = await cache.match(url.href);
			if (hit) return { data: await hit.json() as T, version };
		} catch { /* A cache hibája nem akadályozza az olvasást. */ }
	}
	const data = await load();
	if (cache && data !== null) {
		const put = cache.put(url.href, new Response(JSON.stringify(data), {
			headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' }
		})).catch(() => undefined);
		if (event.platform?.ctx) event.platform.ctx.waitUntil(put);
		else await put;
	}
	return { data, version };
}

/** A HTTP-cache újraellenőriz, az offline másolatot a service worker kezeli. */
export async function contentResponse(event: RequestEvent, data: unknown, version: number, userId: string | number | null = null): Promise<Response> {
	const etag = `"${await fingerprint([version, userId, data])}"`;
	const headers = {
		'content-type': 'application/json',
		'cache-control': `${userId === null ? 'public' : 'private'}, no-cache, must-revalidate`,
		vary: 'Cookie', etag,
		'x-content-version': String(version),
		'x-content-owner': userId === null ? 'public' : String(userId)
	};
	const match = event.request.headers.get('if-none-match')?.split(',').map((v) => v.trim());
	return new Response(match?.includes(etag) ? null : JSON.stringify(data), { status: match?.includes(etag) ? 304 : 200, headers });
}

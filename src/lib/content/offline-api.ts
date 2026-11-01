import { offlineIdentity } from './content-client';
import { PRIVATE_APP_CACHE_PREFIX } from './content-protocol';

/** A személyes JSON-válaszok fiókonként elkülönülnek, offline nem járnak le. */
export async function privateFetch(url: string, owner = offlineIdentity()?.id): Promise<Response> {
	const identity = offlineIdentity()?.id;
	const target = new URL(url, location.origin);
	if (target.origin !== location.origin || !target.pathname.startsWith('/api/')) throw new Error('Érvénytelen adatútvonal.');
	const unchanged = () => offlineIdentity()?.id === identity;
	const cache = owner && typeof caches !== 'undefined' ? await caches.open(`${PRIVATE_APP_CACHE_PREFIX}${owner}`).catch(() => undefined) : undefined;
	const local = async () => {
		if (!unchanged()) return;
		const hit = await cache?.match(target.href).catch(() => undefined);
		if (!hit || !unchanged() || hit.headers.get('x-content-owner') !== owner) return;
		const headers = new Headers(hit.headers);
		headers.set('x-content-offline', 'true');
		return new Response(hit.body, { status: hit.status, headers });
	};
	if (!navigator.onLine) return await local() ?? new Response(JSON.stringify({ error: 'Ez az adat még nincs elmentve ezen az eszközön.' }), { status: 503, headers: { 'content-type': 'application/json' } });
	try {
		const response = await fetch(url, { cache: 'no-store' });
		if (!unchanged()) throw new Error('A fiók megváltozott a betöltés közben.');
		if (response.status >= 500 || response.status === 429) return await local() ?? response;
		if ([401, 403, 404, 410].includes(response.status)) await cache?.delete(target.href).catch(() => undefined);
		if (response.ok && owner && response.headers.get('x-content-owner') === owner && response.headers.get('content-type')?.includes('application/json')) {
			const body = await response.clone().arrayBuffer();
			if (!unchanged()) throw new Error('A fiók megváltozott a betöltés közben.');
			if (body.byteLength > 5 * 1024 * 1024) return response;
			const headers = new Headers(response.headers);
			headers.set('x-offline-bytes', String(body.byteLength));
			await cache?.delete(target.href).catch(() => undefined);
			await cache?.put(target.href, new Response(body, { status: response.status, headers })).catch(() => undefined);
			const keys = await cache?.keys().catch(() => []) ?? [];
			let bytes = 0;
			for (const [index, key] of [...keys].reverse().entries()) {
				const entry = await cache?.match(key).catch(() => undefined);
				bytes += Number(entry?.headers.get('x-offline-bytes') ?? 0);
				if (index >= 100 || bytes > 50 * 1024 * 1024) await cache?.delete(key).catch(() => undefined);
			}
		}
		if (!unchanged()) throw new Error('A fiók megváltozott a betöltés közben.');
		return response;
	} catch (cause) {
		const hit = await local();
		if (hit) return hit;
		throw cause;
	}
}

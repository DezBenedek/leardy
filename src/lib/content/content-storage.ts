import { CONTENT_CACHE, PRIVATE_CACHE_PREFIX, contentUrl, isContentUrl } from './content-protocol';

/** A worker indulása előtt és hálózat nélkül is ugyanazt a helyi tárat olvassuk. */
export async function readStoredContent(url: URL, owner: string): Promise<Response | undefined> {
	if (typeof caches === 'undefined' || !isContentUrl(url)) return;
	try {
		const key = contentUrl(url.href, url.origin);
		for (const name of [...(owner !== 'public' ? [`${PRIVATE_CACHE_PREFIX}${owner}`] : []), CONTENT_CACHE]) {
			const cache = await caches.open(name);
			let hit = await cache.match(key, { ignoreVary: true });
			if (!hit && url.pathname === '/api/browse' && !url.searchParams.has('quizcounts')) {
				const variant = new URL(key);
				variant.searchParams.set('quizcounts', '1');
				hit = await cache.match(contentUrl(variant.href, url.origin), { ignoreVary: true });
			}
			if (hit?.ok) {
				const headers = new Headers(hit.headers);
				headers.set('x-content-offline', 'true');
				return new Response(hit.body, { status: hit.status, headers });
			}
		}
	} catch { /* A letiltott helyi tár nem akadályozza az online lekérést. */ }
}

export async function storeContent(url: URL, owner: string, response: Response): Promise<void> {
	if (typeof caches === 'undefined' || !isContentUrl(url)) return;
	const key = contentUrl(url.href, url.origin);
	const names = [...(owner !== 'public' ? [`${PRIVATE_CACHE_PREFIX}${owner}`] : []), CONTENT_CACHE];
	if ([401, 403, 404, 410].includes(response.status)) {
		for (const name of names) await (await caches.open(name)).delete(key, { ignoreVary: true });
		return;
	}
	const actualOwner = response.headers.get('x-content-owner');
	if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || (actualOwner !== 'public' && actualOwner !== owner)) return;
	const body = await response.clone().arrayBuffer();
	if (body.byteLength > 50 * 1024 * 1024) return;
	const headers = new Headers(response.headers);
	headers.set('x-sw-used', String(Date.now()));
	headers.set('x-sw-bytes', String(body.byteLength));
	const name = actualOwner === 'public' ? CONTENT_CACHE : `${PRIVATE_CACHE_PREFIX}${owner}`;
	const cache = await caches.open(name);
	await cache.put(key, new Response(body, { status: response.status, headers }));
	const entries = await Promise.all((await cache.keys()).map(async (request) => {
		const stored = await cache.match(request, { ignoreVary: true });
		return { request, at: Number(stored?.headers.get('x-sw-used') ?? 0), bytes: Number(stored?.headers.get('x-sw-bytes') ?? 0) };
	}));
	let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
	let count = entries.length;
	for (const entry of entries.sort((a, b) => a.at - b.at)) {
		if (count <= 300 && bytes <= 50 * 1024 * 1024) break;
		await cache.delete(entry.request, { ignoreVary: true });
		bytes -= entry.bytes; count--;
	}
	if (actualOwner === 'public' && owner !== 'public') await (await caches.open(names[0])).delete(key, { ignoreVary: true });
}

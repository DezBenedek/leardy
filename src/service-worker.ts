/// <reference lib="webworker" />
import { CONTENT_CACHE, PRIVATE_CACHE_PREFIX, contentUrl, isContentUrl, isLearningPath, type ContentMessage } from './lib/content-protocol';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: { url: string; revision: string | null }[] };
declare const __APP_BUILD_TIME__: string;
const manifest = self.__WB_MANIFEST;
const CACHE = `leardy-static-${__APP_BUILD_TIME__}`;
const MAX_ENTRIES = 300;
const MAX_BYTES = 50 * 1024 * 1024;
const LESSON_IMAGE_CACHE = 'leardy-lesson-images-v1';
const flights = new Map<string, Promise<Response>>();
let generation = 0;
let sequence = 0;
const resourceVersions = new Map<string, number>();
const seenRevisions = new Map<string, number>();
function revisionScope(url: string): string {
	const target = new URL(url);
	if (target.pathname === '/api/packages' && target.searchParams.get('id')?.startsWith('deck:')) return `deck:${target.searchParams.get('id')}`;
	return target.pathname === '/api/browse' && target.searchParams.has('subject') ? `subject:${target.searchParams.get('subject')}` : 'catalog';
}
function currentRevision(url: string, response: Response): boolean {
	const revision = Number(response.headers.get('x-content-version') ?? 0);
	const scope = revisionScope(url);
	if (revision < (seenRevisions.get(scope) ?? 0)) return false;
	seenRevisions.set(scope, revision);
	return true;
}
const verifiedTrees = new Map<string, { sequence: number; ids: Set<string> }>();
let writes: Promise<unknown> = Promise.resolve();
// Ha a tartós tárhely nem írható, a friss adat az aktív lapnak még átadható.
const volatile = new Map<string, { response: Response; bytes: number }>();
function volatileWrite(name: string, url: string, response: Response, bytes: number): boolean {
	if (bytes > 5 * 1024 * 1024) return false;
	const key = `${name}:${url}`;
	volatile.delete(key); volatile.set(key, { response, bytes });
	let total = [...volatile.values()].reduce((n, entry) => n + entry.bytes, 0);
	for (const [old, entry] of volatile) {
		if (volatile.size <= 5 && total <= 5 * 1024 * 1024) break;
		volatile.delete(old); total -= entry.bytes;
	}
	return true;
}

interface PushPayload { title?: string; body?: string; url?: string; tag?: string }

self.addEventListener('install', (event) => {
	event.waitUntil((async () => {
		try {
			const cache = await caches.open(CACHE);
			const urls = (manifest ?? []).map((entry) => entry.url);
			// Mobilon ne induljon egyszerre az összes alkalmazásfájl letöltése.
			for (let i = 0; i < Math.max(urls.length, 1); i += 6) await cache.addAll(urls.slice(i, i + 6));
			await self.skipWaiting();
		} catch (error) {
			// Félkész kiadás nem foglalhatja el a működő előző kiadás helyét.
			await caches.delete(CACHE).catch(() => undefined);
			throw error;
		}
	})());
});
self.addEventListener('activate', (event) => {
	event.waitUntil((async () => {
		const keys = await caches.keys();
		// A nyitva maradt PWA még az előző kiadás kódrészleteit kérheti.
		const previous = keys.filter((k) => k.startsWith('leardy-static-') && k !== CACHE).at(-1);
		await Promise.all(keys.filter((k) => (k.startsWith('leardy-static-') && k !== CACHE && k !== previous) || k === 'leardy-api-v1').map((k) => caches.delete(k)));
		await self.clients.claim();
		await notify({ type: 'content-invalidated' });
	})());
});
async function notify(message: ContentMessage): Promise<void> {
	for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage(message);
}
function failure(): Response {
	return new Response(JSON.stringify({ error: 'Nincs kapcsolat. Ez a tananyag még nincs elmentve.' }), { status: 503, headers: { 'content-type': 'application/json' } });
}
function stamped(response: Response, offline: boolean): Response {
	const headers = new Headers(response.headers);
	headers.set('x-content-offline', String(offline));
	return new Response(response.body, { status: response.status, headers });
}
interface CacheEntry { name: string; url: string; at: number; bytes: number }
let cacheIndex: Map<string, CacheEntry> | undefined;
async function trim(name: string, url: string, bytes: number): Promise<void> {
	if (!cacheIndex) {
		const index = new Map<string, CacheEntry>();
		cacheIndex = index;
		for (const cacheName of (await caches.keys()).filter((k) => k === CONTENT_CACHE || k === LESSON_IMAGE_CACHE || k.startsWith(PRIVATE_CACHE_PREFIX))) {
			const cache = await caches.open(cacheName);
			await Promise.all((await cache.keys()).map(async (key) => {
				const response = await cache.match(key, { ignoreVary: true });
				if (response) index.set(`${cacheName}:${key.url}`, { name: cacheName, url: key.url, at: Number(response.headers.get('x-sw-used') ?? 0), bytes: Number(response.headers.get('x-sw-bytes') ?? 0) });
			}));
		}
	}
	const index = cacheIndex!;
	index.set(`${name}:${url}`, { name, url, at: Date.now(), bytes });
	const entries = [...index.entries()].sort((a, b) => a[1].at - b[1].at);
	let total = entries.reduce((n, [,e]) => n + e.bytes, 0);
	let count = entries.length;
	for (const [key, entry] of entries) {
		if (count <= MAX_ENTRIES && total <= MAX_BYTES) break;
		await (await caches.open(entry.name)).delete(entry.url, { ignoreVary: true });
		index.delete(key); total -= entry.bytes; count--;
	}
}
async function write(cache: Cache, name: string, url: string, response: Response, run: number, version: number): Promise<boolean> {
	const body = await response.clone().arrayBuffer();
	if (body.byteLength > MAX_BYTES) return false;
	const headers = new Headers(response.headers);
	headers.set('x-sw-used', String(Date.now()));
	headers.set('x-sw-bytes', String(body.byteLength));
	const task = writes.then(async () => {
		if (run !== generation || version !== (resourceVersions.get(url) ?? 0) || !currentRevision(url, response)) return false;
		await trim(name, url, body.byteLength);
		try {
			await cache.put(url, new Response(body, { status: 200, headers }));
		} catch (error) {
			if (!(error && typeof error === 'object' && 'name' in error && error.name === 'QuotaExceededError')) throw error;
			let freed = 0;
			for (const [key, entry] of [...(cacheIndex?.entries() ?? [])].sort((a, b) => a[1].at - b[1].at)) {
				if (entry.name === name && entry.url === url) continue;
				await (await caches.open(entry.name)).delete(entry.url, { ignoreVary: true });
				cacheIndex?.delete(key); freed += entry.bytes;
				if (freed >= Math.max(body.byteLength, 1024 * 1024)) break;
			}
			await cache.put(url, new Response(body, { status: 200, headers }));
		}
		volatile.delete(`${name}:${url}`);
		return true;
	});
	writes = task.catch(() => undefined);
	try { return await task; }
	catch {
		cacheIndex = undefined;
		if (run !== generation || version !== (resourceVersions.get(url) ?? 0)) return false;
		return volatileWrite(name, url, new Response(body, { status: 200, headers }), body.byteLength);
	}
}
async function removeContent(url: string, names: string[]): Promise<void> {
	resourceVersions.set(url, (resourceVersions.get(url) ?? 0) + 1);
	const task = writes.then(async () => {
		for (const name of names) {
			await (await caches.open(name)).delete(url, { ignoreVary: true });
			cacheIndex?.delete(`${name}:${url}`);
			volatile.delete(`${name}:${url}`);
		}
	});
	writes = task.catch(() => undefined);
	await task;
	await notify({ type: 'content-deleted', url });
}
async function removeLessons(matches: (document: { lessonPage: { lesson: { id: string }; material: { id: string }; level: { id: string }; subject: { id: string } } }) => boolean, run: number): Promise<void> {
	const cache = await caches.open(CONTENT_CACHE);
	const urls = new Set((await cache.keys()).map((key) => key.url));
	for (const key of volatile.keys()) if (key.startsWith(`${CONTENT_CACHE}:`)) urls.add(key.slice(CONTENT_CACHE.length + 1));
	for (const url of urls) {
		if (!/^\/api\/lessons\/[^/]+$/.test(new URL(url).pathname)) continue;
		const stored = volatile.get(`${CONTENT_CACHE}:${url}`)?.response.clone() ?? await cache.match(url, { ignoreVary: true });
		const document = stored ? await stored.json() : null;
		if (run !== generation) return;
		if (document?.lessonPage && matches(document)) await removeContent(url, [CONTENT_CACHE]);
	}
}
async function reconcileTree(url: string, response: Response, run: number): Promise<void> {
	const request = new URL(url);
	if (request.pathname !== '/api/browse' || !request.searchParams.has('subject') || request.searchParams.has('level')) return;
	const data = await response.clone().json();
	if (!data.tree?.levels || run !== generation) return;
	const ids = new Set<string>(data.tree.levels.flatMap((l: { materials: { lessons: { id: string }[] }[] }) => l.materials.flatMap((m) => m.lessons.map((le) => le.id))));
	verifiedTrees.set(data.tree.id, { sequence: ++sequence, ids });
	await removeLessons((document) => document.lessonPage.subject.id === data.tree.id && !ids.has(document.lessonPage.lesson.id), run);
}
async function refresh(req: Request, url: string, hit: Response | undefined, requestedOwner: string): Promise<Response> {
	const version = resourceVersions.get(url) ?? 0;
	const flightKey = `${generation}:${version}:${requestedOwner}:${url}`;
	const existing = flights.get(flightKey);
	if (existing) return (await existing).clone();
	const run = generation;
	const started = ++sequence;
	const task = (async () => {
		try {
			const headers = new Headers(req.headers);
			headers.delete('x-content-read');
			if (hit?.headers.get('etag')) headers.set('if-none-match', hit.headers.get('etag')!);
			const response = await fetch(new Request(req, { headers, cache: 'no-store' }));
			if (run !== generation || version !== (resourceVersions.get(url) ?? 0)) return failure();
			// A CDN a 304 egyedi fejléceit elhagyhatja; az ETag a tárolt változatot igazolja.
			const metadata = response.status === 304 && hit ? hit : response;
			if ((response.ok || response.status === 304) && !currentRevision(url, metadata)) {
				// Régi válasz nem indíthat újabb ellenőrzést és végtelen kérésláncot.
				return hit ? stamped(hit.clone(), true) : failure();
			}
			const owner = metadata.headers.get('x-content-owner');
			const name = owner === 'public' ? CONTENT_CACHE : `${PRIVATE_CACHE_PREFIX}${requestedOwner}`;
			const cache = await caches.open(name);
			if (owner === 'public' && requestedOwner !== 'public') await (await caches.open(`${PRIVATE_CACHE_PREFIX}${requestedOwner}`)).delete(url, { ignoreVary: true });
			if (response.status === 304 && hit && (owner === 'public' || owner === requestedOwner)) {
				await write(cache, name, url, hit.clone(), run, version).catch(() => undefined);
				await notify({ type: 'content-status', url, offline: false });
				return stamped(hit.clone(), false);
			}
			if (response.status === 404 || response.status === 410 || response.status === 401 || response.status === 403) {
				await removeContent(url, [CONTENT_CACHE, `${PRIVATE_CACHE_PREFIX}${requestedOwner}`]);
				const target = new URL(url);
				if (target.pathname === '/api/browse' && target.searchParams.has('subject') && (response.status === 404 || response.status === 410)) {
					const subjectId = target.searchParams.get('subject')!;
					verifiedTrees.set(subjectId, { sequence: ++sequence, ids: new Set() });
					await removeLessons((document) => document.lessonPage.subject.id === subjectId, run);
				}
				return response;
			}
			if (response.status >= 500) throw new Error('A szerver nem elérhető.');
			if (response.ok && response.headers.get('content-type')?.includes('application/json') && (owner === 'public' || (requestedOwner !== 'public' && owner === requestedOwner))) {
				if (new URL(url).pathname.startsWith('/api/lessons/')) {
					const document = await response.clone().json();
					const tree = verifiedTrees.get(document.lessonPage?.subject.id);
					if (tree && tree.sequence > started && !tree.ids.has(document.lessonPage.lesson.id)) return failure();
				}
				const stored = await write(cache, name, url, response.clone(), run, version);
				await reconcileTree(url, response, run).catch(() => undefined);
				if (run !== generation || version !== (resourceVersions.get(url) ?? 0)) return failure();
				if (stored && hit?.headers.get('etag') !== response.headers.get('etag')) await notify({ type: 'content-updated', url });
				await notify({ type: 'content-status', url, offline: false });
			}
			return response;
		} catch {
			await notify({ type: 'content-status', url, offline: true });
			return hit ? stamped(hit.clone(), true) : failure();
		}
	})();
	flights.set(flightKey, task);
	try { return (await task).clone(); }
	finally { if (flights.get(flightKey) === task) flights.delete(flightKey); }
}
self.addEventListener('message', (event) => {
	if (event.data?.type !== 'invalidate-content' && event.data?.type !== 'clear-private-content') return;
	generation++;
	event.waitUntil((async () => {
		await writes;
		cacheIndex = undefined;
		verifiedTrees.clear();
		if (event.data.type === 'clear-private-content') {
			for (const key of volatile.keys()) if (key.startsWith(PRIVATE_CACHE_PREFIX)) volatile.delete(key);
		} else volatile.clear();
		const run = generation;
		const names = (await caches.keys()).filter((k) => k.startsWith(PRIVATE_CACHE_PREFIX) || (event.data.type === 'invalidate-content' && k === CONTENT_CACHE));
		// Nyilvános leckék megmaradnak offline olvasásra; a következő kérés ellenőrzi őket.
		if (event.data.type === 'invalidate-content') {
			const change = event.data.change;
			if (change?.action === 'deleteLesson' && typeof change.lessonId === 'string') {
				await removeContent(contentUrl(`/api/lessons/${encodeURIComponent(change.lessonId)}`, self.location.origin), [CONTENT_CACHE]);
			} else if (change?.action === 'deleteTopic' || (change?.action === 'updateLevel' && change.published === false)) {
				await removeLessons((document) => change.action === 'deleteTopic'
					? document.lessonPage.material.id === change.topicId
					: document.lessonPage.level.id === change.levelId, run);
			}
			for (const name of names) {
				const cache = await caches.open(name);
				for (const key of await cache.keys()) {
					if (!new URL(key.url).pathname.startsWith('/api/lessons/')) await cache.delete(key, { ignoreVary: true });
				}
			}
		} else await Promise.all(names.map((k) => caches.delete(k)));
		event.ports[0]?.postMessage({ ok: true });
		await notify({ type: 'content-invalidated' });
	})());
});
self.addEventListener('fetch', (event) => {
	const req = event.request;
	const url = new URL(req.url);
	if (req.method !== 'GET' || url.origin !== self.location.origin) return;
	if (/^\/api\/(?:lesson|quiz)-images\/[a-f0-9-]{36}$/.test(url.pathname)) {
		const run = generation;
		const load = (async () => {
			const cache = await caches.open(LESSON_IMAGE_CACHE);
			const hit = await cache.match(req);
			if (hit) return hit;
			const response = await fetch(req);
			if (response.ok && response.headers.get('content-type')?.startsWith('image/') && Number(response.headers.get('content-length')) <= 10 * 1024 * 1024) {
				const bytes = await response.clone().arrayBuffer();
				if (bytes.byteLength <= 10 * 1024 * 1024) {
					const task = writes.then(async () => {
						if (run !== generation) return;
						const headers = new Headers(response.headers);
						headers.set('x-sw-used', String(Date.now())); headers.set('x-sw-bytes', String(bytes.byteLength));
						await trim(LESSON_IMAGE_CACHE, req.url, bytes.byteLength);
						await cache.put(req, new Response(bytes, { headers }));
					});
					writes = task.catch(() => undefined);
					await writes;
				}
			}
			return response;
		})().catch(() => fetch(req));
		event.respondWith(load);
		event.waitUntil(load.then(() => undefined).catch(() => undefined));
		return;
	}
	if (isContentUrl(url) && req.cache !== 'no-store') {
		const key = contentUrl(req.url, self.location.origin);
		const owner = req.headers.get('x-content-user') ?? 'public';
		let complete: () => void = () => {};
		const lifetime = new Promise<void>((resolve) => { complete = resolve; });
		event.waitUntil(lifetime);
		event.respondWith((async () => {
			try {
				const shared = await caches.open(CONTENT_CACHE);
				const personal = owner !== 'public' ? await caches.open(`${PRIVATE_CACHE_PREFIX}${owner}`) : null;
				const hit = volatile.get(`${PRIVATE_CACHE_PREFIX}${owner}:${key}`)?.response.clone()
					?? (await personal?.match(key, { ignoreVary: true }))
					?? volatile.get(`${CONTENT_CACHE}:${key}`)?.response.clone()
					?? await shared.match(key, { ignoreVary: true });
				if (hit) currentRevision(key, hit);
				if (req.headers.get('x-content-read') === 'cached' || !self.navigator.onLine) { complete(); return hit ? stamped(hit, !self.navigator.onLine) : failure(); }
				const update = refresh(req, key, hit?.clone(), owner);
				void update.finally(complete).catch(() => undefined);
				return hit ? stamped(hit, !self.navigator.onLine) : update;
			} catch { complete(); return fetch(req); }
		})());
		return;
	}
	if (req.mode === 'navigate') {
		event.respondWith(fetch(req).catch(async () => {
			if (isLearningPath(url.pathname)) return (await (await caches.open(CACHE)).match('/tanulas')) ?? Response.error();
			if (url.pathname === '/') return Response.redirect(new URL('/tanulas', self.location.origin));
			return Response.error();
		}));
		return;
	}
	if (url.pathname.startsWith('/api/')) return;
	event.respondWith((async () => {
		try {
			const hit = await (await caches.open(CACHE)).match(req);
			if (hit) return hit;
			// Régi kódot csak tartalomazonosítós fájlnévhez adunk vissza.
			if (url.pathname.startsWith('/_app/immutable/')) {
				for (const name of (await caches.keys()).filter((k) => k.startsWith('leardy-static-') && k !== CACHE).reverse()) {
					const previous = await (await caches.open(name)).match(req);
					if (previous) return previous;
				}
			}
		} catch {
			// A telefon helyi tárhelyhibája nem szakíthatja meg az online indulást.
		}
		return fetch(req);
	})());
});

self.addEventListener('push', (event) => {
	let data: PushPayload = {};
	try {
		if (event.data) data = event.data.json() as PushPayload;
	} catch {
		// Üres vagy nem JSON payload
	}
	const title = data.title || 'Leardy';
	const body = data.body || 'Új esemény a tantermedben.';
	const url = data.url || '/';
	const tag = data.tag || 'leardy';
	const options = {
		body,
		icon: '/icons/icon-192.png',
		badge: '/icons/icon-192.png',
		data: { url },
		tag,
		renotify: false
	} as NotificationOptions & { renotify: boolean };
	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
	const raw = (event.notification.data as { url?: string } | null)?.url ?? '/';
	event.notification.close();
	let target: URL;
	try {
		target = new URL(raw, self.location.origin);
	} catch {
		target = new URL('/', self.location.origin);
	}
	if (target.origin !== self.location.origin) target = new URL('/', self.location.origin);
	const path = target.pathname;
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			for (const c of clients) {
				try {
					const u = new URL(c.url);
					if (u.origin !== self.location.origin) continue;
					if (u.pathname === path || (path !== '/' && u.pathname.startsWith(`${path}/`))) {
						return c.focus();
					}
				} catch {
					// érvénytelen url: következő kliens
				}
			}
			if (self.clients.openWindow) return self.clients.openWindow(target.href);
			return undefined;
		})
	);
});

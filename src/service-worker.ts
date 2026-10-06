/// <reference lib="webworker" />

/* Leardy service worker: statikus precache + web push fogadas.
 * injectManifest modban a build a `self.__WB_MANIFEST` helyre szurja be az
 * asset listat (a workbox-build szoveget keres, ezert kell a literalis).
 * Olvaso API-keresekhez (/api/browse, /api/packages) stale-while-revalidate
 * futasideju gyorstar jar offline fallbackkel: a tananyag repulogep-modban
 * is megnyithato, az elo szemelyes adatok (home, library, classroom, auth)
 * pedig mindig halozatrol jonnek. */

declare const self: ServiceWorkerGlobalScope & {
	__WB_MANIFEST: { url: string; revision: string | null }[];
};

const CACHE = 'leardy-static-v3';
const API_CACHE = 'leardy-api-v1';
const SW_AT = 'x-sw-at';
const API_MAX_ENTRIES = 300;
/* Frissességi ablakok: nyilvános tananyag percekig frissnek számít és
 * háttérben újratöltődik; lejárt, de tárolt válasz hiba esetén is visszajön. */
const API_TTL_LONG = 30 * 60_000;
const API_TTL_TREE = 10 * 60_000;

interface PushPayload {
	title?: string;
	body?: string;
	url?: string;
	tag?: string;
}

self.addEventListener('install', (event) => {
	// Devben nincs beágyazott manifest, csak éles buildben.
	const urls = (self.__WB_MANIFEST ?? []).map((e) => e.url);
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(urls))
			.then(() => self.skipWaiting())
			.catch(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== CACHE && k !== API_CACHE).map((k) => caches.delete(k)))
			)
			.then(() => self.clients.claim())
	);
});

/** Gyorstárazható olvasó API-e a kérés? Csak a tananyag-böngészés
 *  (személyes home/library/classroom/auth soha). */
function apiTtl(req: Request, url: URL): number | null {
	if (req.method !== 'GET' || req.cache === 'no-store') return null;
	if (url.pathname === '/api/browse') {
		return url.searchParams.has('subject') ? API_TTL_TREE : API_TTL_LONG;
	}
	if (url.pathname === '/api/packages') {
		const id = url.searchParams.get('id') ?? '';
		if (url.searchParams.get('scope') === 'cards') return API_TTL_LONG;
		if (id.startsWith('pack:') || id.startsWith('cards:')) return API_TTL_LONG;
		// Saját csomagok, kvízlista, csatolt csomagok: hálózat az első,
		// de offline a tárolt válasz is visszajöhet (ttl 0).
		return 0;
	}
	return null;
}

function cachedAge(res: Response): number {
	const at = Number(res.headers.get(SW_AT) ?? '0');
	if (!at) return Number.POSITIVE_INFINITY;
	return Date.now() - at;
}

function putApi(url: string, res: Response): Promise<void> {
	if (!res.ok) return Promise.resolve();
	const type = res.headers.get('content-type') ?? '';
	if (!type.includes('application/json')) return Promise.resolve();
	const stamped = new Response(res.body, {
		status: res.status,
		statusText: res.statusText,
		headers: { ...Object.fromEntries(res.headers.entries()), [SW_AT]: String(Date.now()) }
	});
	return caches
		.open(API_CACHE)
		.then((cache) => cache.put(url, stamped))
		.then(() =>
			caches.open(API_CACHE).then((cache) =>
				cache.keys().then((keys) => {
					if (keys.length > API_MAX_ENTRIES) {
						return Promise.all(keys.slice(0, keys.length - API_MAX_ENTRIES).map((k) => cache.delete(k)));
					}
					return undefined;
				})
			)
		)
		.catch(() => undefined);
}

function offlineJson(): Response {
	return new Response(JSON.stringify({ error: 'Offline vagy. A mentett tananyag elérhető.' }), {
		status: 503,
		headers: { 'content-type': 'application/json' }
	});
}

/** Stale-while-revalidate olvasó API-kra: friss találat azonnal + csendes
 *  frissítés; lejárt találatnál hálózat, hibánál a tárolt válasz. */
function serveApi(event: FetchEvent, ttl: number): void {
	const url = event.request.url;
	event.respondWith(
		caches.open(API_CACHE).then((cache) =>
			cache.match(url).then((hit) => {
				const age = hit ? cachedAge(hit) : Number.POSITIVE_INFINITY;
				const refresh = fetch(event.request)
					.then((res) => {
						if (res.ok) void putApi(url, res.clone());
						return res;
					})
					.catch(() => hit ?? offlineJson());
				if (hit && age <= ttl) {
					event.waitUntil(refresh.then(() => undefined).catch(() => undefined));
					return hit;
				}
				return refresh.then(
					(res) => res,
					() => hit ?? offlineJson()
				);
			})
		)
	);
}

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	let url: URL;
	try {
		url = new URL(req.url);
	} catch {
		return;
	}
	if (url.origin !== self.location.origin) return;
	const ttl = apiTtl(req, url);
	if (ttl !== null) {
		serveApi(event, ttl);
		return;
	}
	if (url.pathname.startsWith('/api/')) return;
	// Navigacio es SSR: halozat, service worker nem cache-el HTML-t.
	if (req.mode === 'navigate') return;
	event.respondWith(
		caches
			.match(req)
			.then((hit) => {
				if (hit) return hit;
				return fetch(req).then((res) => {
					if (res.ok && (url.pathname.startsWith('/client/') || url.pathname.startsWith('/icons/'))) {
						const copy = res.clone();
						caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
					}
					return res;
				});
			})
			.catch(() => Response.error())
	);
});

self.addEventListener('push', (event) => {
	let data: PushPayload = {};
	try {
		if (event.data) data = event.data.json() as PushPayload;
	} catch {
		// ures vagy nem JSON payload
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

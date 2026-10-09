import { browser } from '$app/environment';
import { CONTENT_EVENT, IDENTITY_KEY, type ContentMessage } from './content-protocol';

export interface OfflineIdentity { id: string; name: string }

export function offlineIdentity(): OfflineIdentity | null {
	if (!browser) return null;
	try {
		const value = JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? 'null');
		return value && typeof value.id === 'string' && typeof value.name === 'string' ? value : null;
	} catch { return null; }
}

export function rememberIdentity(user: OfflineIdentity | null): void {
	if (!browser) return;
	try {
		if (user) localStorage.setItem(IDENTITY_KEY, JSON.stringify(user));
		else localStorage.removeItem(IDENTITY_KEY);
	} catch { /* A leckeolvasás tárolt fiók nélkül is működik. */ }
}

export function contentFetch(url: string, cacheOnly = false): Promise<Response> {
	return fetch(url, { headers: {
		'x-content-user': offlineIdentity()?.id ?? 'public',
		...(cacheOnly ? { 'x-content-read': 'cached' } : {})
	} });
}

export function subscribeContent(callback: (message: ContentMessage) => void): () => void {
	if (!browser) return () => {};
	const listener = (event: Event) => callback((event as CustomEvent<ContentMessage>).detail);
	window.addEventListener(CONTENT_EVENT, listener);
	return () => window.removeEventListener(CONTENT_EVENT, listener);
}

/** Egy központi híd a worker, a megnyitott oldalak és a Query között. */
export function startContentSync(): () => void {
	let refreshedAt = 0;
	try {
		for (const key of Object.keys(localStorage)) if (key.startsWith('leardy:q:') || key === 'leardy-library') localStorage.removeItem(key);
	} catch { /* A régi gyorstár nem szükséges az olvasáshoz. */ }
	const receive = (event: MessageEvent) => {
		if (!event.data?.type?.startsWith('content-')) return;
		if (event.data.type === 'content-deleted' && event.data.url) {
			const match = /^\/api\/lessons\/([^/]+)$/.exec(new URL(event.data.url).pathname);
			if (match) {
				try {
					const last = JSON.parse(localStorage.getItem('leardy-lesson-opened') ?? 'null');
					if (last?.id === decodeURIComponent(match[1])) localStorage.removeItem('leardy-lesson-opened');
				} catch { /* A sérült előzmény nem akadályozza a frissítést. */ }
			}
		}
		window.dispatchEvent(new CustomEvent(CONTENT_EVENT, { detail: event.data }));
	};
	const refresh = () => {
		if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - refreshedAt < 1000) return;
		refreshedAt = Date.now();
		window.dispatchEvent(new CustomEvent(CONTENT_EVENT, { detail: { type: 'content-invalidated' } }));
	};
	const identityChanged = (event: StorageEvent) => {
		if (event.key === IDENTITY_KEY && event.oldValue !== event.newValue) {
			if (navigator.onLine) location.reload(); else location.replace('/offline');
		}
	};
	navigator.serviceWorker?.addEventListener('message', receive);
	window.addEventListener('online', refresh);
	window.addEventListener('storage', identityChanged);
	document.addEventListener('visibilitychange', refresh);
	return () => {
		navigator.serviceWorker?.removeEventListener('message', receive);
		window.removeEventListener('online', refresh);
		window.removeEventListener('storage', identityChanged);
		document.removeEventListener('visibilitychange', refresh);
	};
}

export async function invalidateContent(change?: Record<string, unknown>): Promise<void> {
	const controller = navigator.serviceWorker?.controller;
	if (controller) {
		await new Promise<void>((resolve) => {
			const channel = new MessageChannel();
			const timer = setTimeout(resolve, 5000);
			channel.port1.onmessage = () => { clearTimeout(timer); channel.port1.close(); resolve(); };
			controller.postMessage({ type: 'invalidate-content', change }, [channel.port2]);
		});
	}
	window.dispatchEvent(new CustomEvent(CONTENT_EVENT, { detail: { type: 'content-invalidated' } }));
}

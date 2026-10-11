import { browser } from '$app/environment';
import { CONTENT_EVENT, IDENTITY_KEY, type ContentMessage } from './content-protocol';
import { readStoredContent, storeContent } from './content-storage';
import { offlineLibraryResponse, writeOfflineLibrary } from './offline-library';

export interface OfflineIdentity {
	id: string; name: string; email?: string; role?: string; school_id?: string;
	xp?: number; streak?: number; is_admin?: number; isEditor?: boolean;
}

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

export async function contentFetch(url: string, cacheOnly = false): Promise<Response> {
	if (!browser) return fetch(url);
	const owner = offlineIdentity()?.id ?? 'public';
	const target = new URL(url, location.origin);
	const local = async () => {
		if ((offlineIdentity()?.id ?? 'public') !== owner) return;
		const stored = await readStoredContent(target, owner);
		const library = owner !== 'public' ? offlineLibraryResponse(target, owner) : undefined;
		if (!stored || !library) return stored ?? library;
		if (target.pathname === '/api/packages') {
			const cached = await stored.json();
			const saved = await library.json();
			const data = target.searchParams.has('id') ? { ...cached, package: saved.package }
				: { packages: [...new Map([...cached.packages, ...saved.packages].map((pkg) => [pkg.quizId, pkg])).values()] };
			return new Response(JSON.stringify(data), { headers: library.headers });
		}
		return stored;
	};
	const report = (response: Response) => {
		window.dispatchEvent(new CustomEvent(CONTENT_EVENT, { detail: { type: 'content-status', url: target.href, offline: response.headers.get('x-content-offline') === 'true' } }));
		return response;
	};
	if (!navigator.onLine || cacheOnly) {
		const hit = await local();
		if (hit) {
			if (cacheOnly && navigator.onLine) hit.headers.set('x-content-offline', 'false');
			return report(hit);
		}
	}
	try {
		const controlled = !!navigator.serviceWorker?.controller;
		const response = await fetch(url, { headers: {
			'x-content-user': owner,
			...(cacheOnly && controlled ? { 'x-content-read': 'cached' } : {})
		} });
		if ((offlineIdentity()?.id ?? 'public') !== owner) throw new Error('A fiók megváltozott a betöltés közben.');
		if (response.status >= 500) {
			const hit = await local();
			if (hit) return report(hit);
		}
		if (target.pathname === '/api/library' && !target.searchParams.has('ids') && response.ok && owner !== 'public') {
			const data = await response.clone().json();
			if (Array.isArray(data.packages)) {
				try { writeOfflineLibrary(owner, data.packages); } catch { /* A hálózati adat ettől még használható. */ }
			}
		}
		if (!controlled) await storeContent(target, owner, response).catch(() => undefined);
		return report(response);
	} catch (error) {
		const hit = await local();
		if (hit) return report(hit);
		throw error;
	}
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
		window.dispatchEvent(new CustomEvent(CONTENT_EVENT, { detail: { type: 'content-invalidated', reason: 'resume' } }));
	};
	const identityChanged = (event: StorageEvent) => {
		if (event.key === IDENTITY_KEY && event.oldValue !== event.newValue) {
			location.reload();
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

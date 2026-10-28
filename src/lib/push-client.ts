import { browser, dev } from '$app/environment';
import { syncNotifPrefs } from '$lib/settings';

export type PushState = 'unsupported' | 'denied' | 'off' | 'on' | 'error';
type PushResult = { ok: true } | { ok: false; error: string };

function decodeKey(value: string): Uint8Array<ArrayBuffer> {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	return Uint8Array.from(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)), (char) => char.charCodeAt(0));
}

function encodeKey(value: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function pushSupported(): boolean {
	return browser && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
	if (dev) return null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			navigator.serviceWorker.ready,
			new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 8000); })
		]);
	} finally {
		clearTimeout(timer);
	}
}

let syncing: Promise<PushState> | null = null;

/** Az „aktív” állapothoz a szerveren is sikeresen mentett feliratkozás kell. */
async function syncSubscription(): Promise<PushState> {
	if (!pushSupported()) return 'unsupported';
	if (Notification.permission === 'denied') return 'denied';
	if (Notification.permission !== 'granted') return 'off';
	const reg = await readyRegistration();
	if (!reg) return 'off';
	let sub = await reg.pushManager.getSubscription();
	const response = await fetch('/api/push/vapid', { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
	if (!response.ok) throw new Error('A push szolgáltatás most nem elérhető.');
	const { publicKey } = await response.json() as { publicKey?: string };
	if (!publicKey) throw new Error('Hiányzó értesítési kulcs.');
	const key = decodeKey(publicKey);
	const previous = sub?.options.applicationServerKey;
	if (sub && previous && encodeKey(previous) !== encodeKey(key.buffer)) {
		if (!await sub.unsubscribe()) throw new Error('A régi feliratkozás nem frissíthető.');
		sub = null;
	}
	sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key.buffer });
	const p256dh = sub.getKey('p256dh');
	const auth = sub.getKey('auth');
	if (!p256dh || !auth) throw new Error('Érvénytelen eszközfeliratkozás.');
	const saved = await fetch('/api/push/subscriptions', {
		method: 'POST', signal: AbortSignal.timeout(10_000),
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ endpoint: sub.endpoint, p256dh: encodeKey(p256dh), auth: encodeKey(auth) })
	});
	if (!saved.ok) throw new Error('Az értesítési kapcsolat mentése nem sikerült.');
	if (!await syncNotifPrefs()) throw new Error('Az értesítési beállítások mentése nem sikerült.');
	return 'on';
}

export async function pushState(): Promise<PushState> {
	if (syncing) return syncing;
	syncing = syncSubscription().catch(() => 'error' as const).finally(() => { syncing = null; });
	return syncing;
}

export async function subscribePush(): Promise<PushResult> {
	if (!pushSupported()) return { ok: false, error: 'Ezen az eszközön nem érhető el a push értesítés.' };
	try {
		// iPhone-on az engedélykérésnek közvetlenül a koppintásból kell indulnia.
		if (Notification.permission === 'default') await Notification.requestPermission();
		if (Notification.permission !== 'granted') return { ok: false, error: 'Engedélyezd az értesítéseket a telefon vagy a böngésző beállításaiban.' };
		if (syncing) await syncing;
		const state = await syncSubscription();
		return state === 'on' ? { ok: true } : { ok: false, error: dev
			? 'Fejlesztői módban nincs push szolgáltatás. Az éles vagy előnézeti appban próbáld ki.'
			: 'Az alkalmazás még indul. Próbáld újra néhány másodperc múlva.' };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : 'A kapcsolódás nem sikerült. Próbáld újra!' };
	}
}

/** Induláskor és visszatéréskor javítjuk a már engedélyezett eszköz kapcsolatát. */
export function startPushSync(): () => void {
	const sync = () => { if (!document.hidden && navigator.onLine) void pushState(); };
	const visible = () => { if (!document.hidden) sync(); };
	sync();
	window.addEventListener('online', sync);
	window.addEventListener('focus', sync);
	document.addEventListener('visibilitychange', visible);
	return () => {
		window.removeEventListener('online', sync);
		window.removeEventListener('focus', sync);
		document.removeEventListener('visibilitychange', visible);
	};
}

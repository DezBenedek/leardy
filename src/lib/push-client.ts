import { browser, dev } from '$app/environment';

/* Bongeszos web push feliratkozas az eppen hasznalt service worker regisztraciora.
 * A szerver a tantermi esemenyeknel (uzenet, feladat, beadando, ertekeles)
 * azonnal kuld push-t, igy zart appnal is megerkezik.
 * Fejlesztoi modban nincs service worker (a layout le is szedi),
 * ezert ilyenkor a push nem kapcsolhato: ezt hibauzenet jelzi
 * fagyas helyett. */

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

function urlBase64ToUint8Array(base64: string): Uint8Array {
	const norm = base64.replace(/-/g, '+').replace(/_/g, '/');
	const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
	const bin = atob(norm + pad);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function b64urlEncode(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function pushSupported(): boolean {
	return (
		browser &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window
	);
}

export async function pushState(): Promise<PushState> {
	if (!pushSupported()) return 'unsupported';
	if (Notification.permission === 'denied') return 'denied';
	try {
		const reg = await readyRegistration();
		if (!reg) return 'off';
		const sub = await reg.pushManager.getSubscription();
		return sub ? 'on' : 'off';
	} catch {
		return 'off';
	}
}

/* Service worker regisztráció: ha nincs (pl. fejlesztői módban),
 * null-lal tér vissza a végtelen várakozás helyett. */
const READY_TIMEOUT_MS = 5000;

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
	try {
		const existing = await navigator.serviceWorker.getRegistration();
		if (!existing) return null;
		const ready = await Promise.race([
			navigator.serviceWorker.ready,
			new Promise<null>((resolve) => setTimeout(() => resolve(null), READY_TIMEOUT_MS))
		]);
		return ready ?? existing;
	} catch {
		return null;
	}
}

export async function subscribePush(): Promise<{ ok: true } | { ok: false; error: string }> {
	if (!pushSupported()) return { ok: false, error: 'Ez a böngésző nem támogatja a push-t.' };
	try {
		if (Notification.permission === 'default') {
			const perm = await Notification.requestPermission();
			if (perm !== 'granted') return { ok: false, error: 'Engedélyezd az értesítéseket a böngészőben.' };
		} else if (Notification.permission === 'denied') {
			return { ok: false, error: 'Le van tiltva. A böngésző beállításaiban engedélyezd.' };
		}
		const keyRes = await fetch('/api/push/vapid');
		if (!keyRes.ok) return { ok: false, error: 'A push szolgáltatás most nem elérhető.' };
		const { publicKey } = (await keyRes.json()) as { publicKey?: string };
		if (!publicKey) return { ok: false, error: 'A push szolgáltatás most nem elérhető.' };
		const reg = await readyRegistration();
		if (!reg) {
			return dev
				? { ok: false, error: 'Fejlesztői módban nincs service worker, a push itt nem kapcsolható.' }
				: { ok: false, error: 'Nincs service worker. Frissítsd az oldalt, majd próbáld újra!' };
		}
		const sub = await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(publicKey).slice().buffer as ArrayBuffer
		});
		const rawP256dh = sub.getKey('p256dh');
		const rawAuth = sub.getKey('auth');
		if (!rawP256dh || !rawAuth) {
			await sub.unsubscribe().catch(() => {});
			return { ok: false, error: 'Nem sikerült a feliratkozás.' };
		}
		const res = await fetch('/api/push/subscriptions', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				endpoint: sub.endpoint,
				p256dh: b64urlEncode(new Uint8Array(rawP256dh)),
				auth: b64urlEncode(new Uint8Array(rawAuth))
			})
		});
		if (!res.ok) {
			await sub.unsubscribe().catch(() => {});
			const j = (await res.json().catch(() => ({}))) as { error?: string };
			return { ok: false, error: j.error ?? 'Nem sikerült menteni a feliratkozást.' };
		}
		return { ok: true };
	} catch {
		return { ok: false, error: 'Hálózati hiba. Próbáld újra!' };
	}
}

export async function unsubscribePush(): Promise<{ ok: true } | { ok: false; error: string }> {
	if (!pushSupported()) return { ok: false, error: 'Ez a böngésző nem támogatja a push-t.' };
	try {
		const reg = await readyRegistration();
		const sub = await reg?.pushManager.getSubscription().catch(() => null);
		if (sub) {
			await fetch('/api/push/subscriptions', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ endpoint: sub.endpoint })
			}).catch(() => {});
			await sub.unsubscribe().catch(() => {});
		}
		return { ok: true };
	} catch {
		return { ok: false, error: 'Hálózati hiba. Próbáld újra!' };
	}
}

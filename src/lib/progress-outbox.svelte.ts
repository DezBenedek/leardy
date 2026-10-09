import { browser } from '$app/environment';
import { offlineIdentity } from './content-client';
import { markLessonDone, invalidate } from './query.svelte';
import { toast } from './toast.svelte';

export interface PendingProgress {
	eventId: string; userId: string; lessonId: string; quizVersion: string;
	score: number; total: number; occurredAt: number;
	status?: 'changed' | 'deleted' | 'invalid';
}

let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
	return database ??= new Promise((resolve, reject) => {
		const request = indexedDB.open('leardy-progress-v1', 1);
		request.onupgradeneeded = () => request.result.createObjectStore('events', { keyPath: 'eventId' });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => { database = undefined; reject(request.error); };
	});
}
async function store(event: PendingProgress | string): Promise<void> {
	const db = await open();
	await new Promise<void>((resolve, reject) => {
		const transaction = db.transaction('events', 'readwrite');
		const objects = transaction.objectStore('events');
		if (typeof event === 'string') objects.delete(event); else objects.put(event);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}
export async function pendingProgress(): Promise<PendingProgress[]> {
	if (!browser) return [];
	const db = await open();
	return new Promise((resolve, reject) => {
		const request = db.transaction('events').objectStore('events').getAll();
		request.onsuccess = () => resolve((request.result as PendingProgress[]).filter((e) => e.userId === offlineIdentity()?.id).sort((a, b) => a.occurredAt - b.occurredAt));
		request.onerror = () => reject(request.error);
	});
}
export async function dismissProgress(eventId: string): Promise<void> {
	if ((await pendingProgress()).some((e) => e.eventId === eventId && e.status)) await store(eventId);
	await refreshStatus();
}
export const outbox = $state({ pending: 0, rejected: [] as PendingProgress[], syncing: false });
async function refreshStatus(): Promise<void> {
	const events = await pendingProgress();
	outbox.pending = events.filter((e) => !e.status).length;
	outbox.rejected = events.filter((e) => !!e.status);
}
let running: Promise<void> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let attempts = 0;
let queuedDuringSync = false;

export async function queueProgress(lessonId: string, quizVersion: string, score: number, total: number): Promise<void> {
	const user = offlineIdentity();
	if (!user) { toast.info('Gyakorlás befejezve', 'Az eredmény mentéséhez jelentkezz be internetkapcsolattal.'); return; }
	try {
		await store({ eventId: crypto.randomUUID(), userId: user.id, lessonId, quizVersion, score, total, occurredAt: Date.now() });
		await refreshStatus();
		toast.info('Eredmény rögzítve', 'Internetkapcsolattal automatikusan mentjük a fiókodba.');
		if (running) queuedDuringSync = true;
		void syncProgress();
	} catch { toast.error('Az eredmény nem menthető', 'A böngésző helyi tárhelye nem elérhető.'); }
}
export function syncProgress(): Promise<void> {
	if (running) return running;
	running = (async () => {
		clearTimeout(timer);
		await refreshStatus();
		if (!navigator.onLine || !outbox.pending) return;
		outbox.syncing = true;
		try {
			const identity = offlineIdentity();
			const auth = await fetch('/api/auth/me', { cache: 'no-store' });
			if (auth.status >= 500 || auth.status === 429) throw new Error('Átmeneti szerverhiba.');
			if (!auth.ok || (await auth.json()).user?.id !== identity?.id) return;
			for (const event of await pendingProgress()) {
				if (event.status || offlineIdentity()?.id !== identity?.id) continue;
				const response = await fetch('/api/progress', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) });
				if (response.status === 401 || response.status === 403) return;
				if (response.status >= 500 || response.status === 429) throw new Error('Átmeneti szerverhiba.');
				const result = await response.json();
				if (response.ok && result.ok) {
					await store(event.eventId); markLessonDone(event.lessonId); invalidate('home');
				} else {
					await store({ ...event, status: result.status === 'changed' || result.status === 'deleted' ? result.status : 'invalid' });
					toast.warning('Új kitöltés szükséges', 'A lecke vagy a kérdéssor közben megváltozott. A korábbi eredményt helyben megőriztük.');
				}
			}
			attempts = 0;
		} catch {
			timer = setTimeout(() => { void syncProgress(); }, Math.min(300_000, 2000 * 2 ** Math.min(attempts++, 8)));
		} finally { outbox.syncing = false; await refreshStatus(); }
	})().catch(() => undefined).finally(() => {
		running = undefined;
		if (queuedDuringSync) { queuedDuringSync = false; void syncProgress(); }
	});
	return running;
}
export function startProgressSync(): () => void {
	const run = () => { if (document.visibilityState === 'visible') void syncProgress(); };
	window.addEventListener('online', run);
	document.addEventListener('visibilitychange', run);
	void syncProgress();
	return () => { clearTimeout(timer); window.removeEventListener('online', run); document.removeEventListener('visibilitychange', run); };
}

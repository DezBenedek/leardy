import type { SubjectTree } from './curriculum';
import { browser } from '$app/environment';
import { onDestroy, untrack } from 'svelte';
import { subscribeContent } from './content-client';
import type { ContentMessage } from './content-protocol';

type Fetcher<T> = (cacheOnly?: boolean) => Promise<T>;
interface Entry { data: unknown; at: number }
const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const versions = new Map<string, number>();
const listeners = new Map<string, Set<(data: unknown) => void>>();

function publish(key: string, data: unknown): void {
	for (const listener of listeners.get(key) ?? []) listener(data);
}
function fresh<T>(key: string, ttl: number): T | undefined {
	if (!browser) return undefined;
	const entry = mem.get(key);
	return entry && Date.now() - entry.at <= ttl ? entry.data as T : undefined;
}
export function peek<T>(key: string, ttlMs = 60_000): T | undefined { return fresh<T>(key, ttlMs); }

/** A tartós tananyag a workerben él; régi localStorage-másolatból nem hidratálunk. */
export function clearPersistedCache(): void {
	if (!browser) return;
	invalidate('');
	try {
		for (const key of Object.keys(localStorage)) if (key.startsWith('leardy:q:') || key.startsWith('leardy-library')) localStorage.removeItem(key);
	} catch { /* A tárhely letiltható. */ }
	navigator.serviceWorker?.controller?.postMessage({ type: 'clear-private-content' });
	if (typeof caches !== 'undefined') void caches.delete('leardy-api-v1').catch(() => undefined);
}

export async function getOrFetch<T>(key: string, fetcher: Fetcher<T>, ttlMs = 60_000, _persistMs = 0, force = false, cacheOnly = false): Promise<T> {
	const hit = force ? undefined : fresh<T>(key, ttlMs);
	if (hit !== undefined) return hit;
	const ongoing = inflight.get(key);
	if (ongoing) return ongoing as Promise<T>;
	const version = versions.get(key) ?? 0;
	const promise = fetcher(cacheOnly).then((data) => {
		if (version !== (versions.get(key) ?? 0)) throw new Error('A lekérdezés közben megváltozott az adat.');
		mem.set(key, { data, at: Date.now() });
		publish(key, data);
		return data;
	}).finally(() => { if (inflight.get(key) === promise) inflight.delete(key); });
	inflight.set(key, promise);
	return promise;
}

export function invalidate(prefix: string): void {
	for (const key of new Set([...mem.keys(), ...inflight.keys(), ...listeners.keys()])) {
		if (key.startsWith(prefix)) {
			versions.set(key, (versions.get(key) ?? 0) + 1);
			mem.delete(key); inflight.delete(key);
		}
	}
}

function affected(key: string, message: ContentMessage): boolean {
	if (!message.url) return true;
	const url = new URL(message.url);
	if (url.pathname.startsWith('/api/lessons/')) return key === `lesson:${decodeURIComponent(url.pathname.split('/').pop()!)}`;
	if (url.pathname === '/api/browse') {
		const subject = url.searchParams.get('subject');
		return subject ? key === `tree:${subject}` || key === `counts:tree:${subject}` || key === `levels:${subject}` : key === 'subjects' || key === 'counts:subjects';
	}
	if (url.pathname === '/api/packages') {
		const id = url.searchParams.get('id');
		return id ? key === `package:${id}` : key.startsWith('packages:') || key.startsWith('disc-');
	}
	return false;
}

function sameVariant(key: string, message: ContentMessage): boolean {
	if (!message.url) return false;
	const url = new URL(message.url);
	if (url.pathname === '/api/browse') {
		return !url.searchParams.has('level') && (key.startsWith('counts:') === (url.searchParams.get('quizcounts') === '1'));
	}
	if (url.pathname === '/api/packages' && !url.searchParams.has('id')) {
		if (url.searchParams.has('attachedTo')) return key === `packages:attached:${url.searchParams.get('attachedTo')}`;
		return key === `disc-cards:${url.searchParams.get('subject') ?? ''}:${url.searchParams.get('level') ?? ''}` && url.searchParams.get('scope') === 'cards';
	}
	return true;
}

export class Query<T> {
	data = $state<T | undefined>(undefined);
	loading = $state(true);
	error = $state(false);
	offline = $state(false);
	private last: { key: string; fetcher: Fetcher<T> } | null = null;
	private seq = 0;
	private stop: (() => void) | undefined;
	private unsubscribe: (() => void) | undefined;

	constructor() { onDestroy(() => this.dispose()); }
	dispose(): void { this.seq++; this.stop?.(); this.unsubscribe?.(); this.last = null; }
	prime(key: string | null, staleTtlMs = 60_000): void {
		if (!key) return;
		const hit = fresh<T>(key, staleTtlMs);
		if (hit !== undefined) { this.data = hit; this.loading = false; this.error = false; }
	}
	load(key: string | null, fetcher: Fetcher<T>, _ttlMs = 60_000, staleTtlMs = _ttlMs, _persistMs = 0): void {
		untrack(() => this.configure(key, fetcher, staleTtlMs));
	}
	private configure(key: string | null, fetcher: Fetcher<T>, staleTtlMs: number): void {
		const previous = this.last?.key;
		this.stop?.(); this.unsubscribe?.();
		const run = ++this.seq;
		this.last = key ? { key, fetcher } : null;
		if (previous !== key) this.data = undefined;
		if (!key) { this.data = undefined; this.loading = false; this.error = false; return; }
		if (!browser) return;
		this.prime(key, staleTtlMs);
		this.loading = untrack(() => this.data === undefined);
		this.error = false;
		const listener = (data: unknown) => { if (run === this.seq) { this.data = data as T; this.loading = false; this.error = false; } };
		const set = listeners.get(key) ?? new Set();
		set.add(listener); listeners.set(key, set);
		this.unsubscribe = () => { set.delete(listener); if (!set.size) listeners.delete(key); };
		this.stop = subscribeContent((message) => {
			if (!affected(key, message)) return;
			if (message.type === 'content-status') { this.offline = !!message.offline; return; }
			if (message.type === 'content-deleted') {
				invalidate(key); this.data = undefined; this.loading = false; this.error = true; return;
			}
			if (message.type === 'content-invalidated') invalidate(key);
			this.touch(message.type === 'content-updated' && sameVariant(key, message));
		});
		this.touch();
	}
	touch(cacheOnly = false): void {
		if (!browser || !this.last) return;
		const { key, fetcher } = this.last;
		const run = this.seq;
		// A worker üzenete az eredeti kérés befejezése előtt is megérkezhet.
		// Cache-frissítéskor külön olvasás kell, nem a korábbi promise.
		if (cacheOnly) { versions.set(key, (versions.get(key) ?? 0) + 1); inflight.delete(key); }
		void getOrFetch(key, fetcher, 0, 0, true, cacheOnly).then((data) => {
			if (run === this.seq) { this.data = data; this.loading = false; this.error = false; }
		}, () => { if (run === this.seq) { this.loading = false; if (this.data === undefined) this.error = true; } });
	}
}

interface HomeShape {
	suggestions?: { lessonId: string }[];
	todayDone?: number;
}

/** Lecke készre írása minden tárolt fában és home-javaslatban.
 * Az új objektum az aktív Svelte-nézetekben is frissíti a pipát. */
export function markLessonDone(lessonId: string): void {
	if (!lessonId) return;
	for (const [key, entry] of mem) {
		if (!entry.data || typeof entry.data !== 'object') continue;
		const d = JSON.parse(JSON.stringify(entry.data)) as Partial<SubjectTree> & HomeShape;
		let dirty = false;
		if (Array.isArray(d.levels)) {
			for (const l of d.levels) {
				for (const m of l.materials ?? []) {
					for (const le of m.lessons ?? []) {
						if (le.id === lessonId && !le.done) {
							le.done = true;
							dirty = true;
						}
					}
				}
			}
		}
		if (Array.isArray(d.suggestions)) {
			const rest = d.suggestions.filter((s) => s.lessonId !== lessonId);
			if (rest.length !== d.suggestions.length) {
				d.suggestions = rest;
				d.todayDone = (d.todayDone ?? 0) + 1;
				dirty = true;
			}
		}
		if (dirty) {
			entry.data = d;
			entry.at = Date.now();
			publish(key, d);
		}
	}
}

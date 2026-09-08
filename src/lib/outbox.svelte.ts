// Offline outbox: az író műveletek (értékelés, készre jelölés, felvétel,
// beadás…) offline-ban sorba állnak, és visszakapcsolódáskor automatikusan
// beküldődnek — sorrendben, duplikálás-biztos végpontokra.
// Auth-végpontok (/api/auth/*) nem sorolódnak: bejelentkezni csak élőben lehet.

import { browser } from '$app/environment';
import { auth } from './auth.svelte';
import { invalidate } from './cache';

export class QueuedOffline extends Error {}

interface OutboxItem {
	id: string;
	path: string;
	method: string;
	body: unknown;
	user: string | null;
	ts: number;
}

const STORE_KEY = 'leardy-outbox-v1';
const MAX_ITEMS = 200;

class OutboxStore {
	pending = $state(0);

	constructor() {
		if (!browser) return;
		this.pending = read().length;
		window.addEventListener('online', () => void flushOutbox());
		// Maradék egy korábbi munkamenetből: ha van net, azonnal küldjük.
		if (this.pending > 0) void flushOutbox();
	}
}

export const outbox = new OutboxStore();

function read(): OutboxItem[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
	} catch {
		return [];
	}
}

function write(items: OutboxItem[]): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
	} catch {
		// tiltott storage: csak memóriában él tovább az oldal élettartamáig
	}
	outbox.pending = items.length;
}

/** Sorba állítás (offline íráskor hívja a studyApi réteg). */
export function enqueueOutbox(path: string, method: string, body: unknown): void {
	if (!browser) return;
	const items = read();
	let id = '';
	try {
		id = crypto.randomUUID();
	} catch {
		id = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	}
	items.push({ id, path, method, body, user: auth.user?.email ?? null, ts: Date.now() });
	write(items);
}

/** Beküldés sorrendben. Hálózati hibánál megáll (maradék később), végleges
 *  4xx-nél eldobja az adott tételt (később sem sikerülne: pl. lejárt határidő). */
let flushing = false;

export async function flushOutbox(): Promise<void> {
	if (!browser || flushing) return;
	try {
		if (typeof navigator !== 'undefined' && !navigator.onLine) return;
	} catch {
		return;
	}
	const currentUser = auth.user?.email ?? null;
	if (!currentUser) return; // kijelentkezve nem küldünk idegen sort
	if (read().length === 0) return;
	flushing = true;
	let sent = 0;
	try {
		for (;;) {
			const list = read();
			if (list.length === 0) break;
			const it = list[0];
			if (it.user && it.user !== currentUser) {
				write(list.slice(1)); // más fiókjáé: eldobjuk
				continue;
			}
			let status = 0;
			try {
				const res = await fetch(it.path, {
					method: it.method,
					headers: { 'content-type': 'application/json' },
					body: it.body === undefined ? undefined : JSON.stringify(it.body)
				});
				status = res.status;
			} catch {
				break; // nincs hálózat: a maradék később
			}
			if (status === 0) break;
			if (status >= 200 && status < 300) {
				write(read().slice(1));
				sent++;
				continue;
			}
			if (status === 409 || status === 410 || (status >= 400 && status < 500)) {
				write(read().slice(1)); // végleges hiba (pl. már beadva, lejárt): eldobjuk
				continue;
			}
			break; // 5xx / 429: majd később
		}
	} finally {
		flushing = false;
		outbox.pending = read().length;
	}
	if (sent > 0) {
		// Ami sikerült, az látszódjon: cache-frissítés + friss XP/széria.
		invalidate('stats');
		invalidate('topics');
		invalidate('sources');
		invalidate('assignments');
		invalidate('classrooms');
		try {
			await auth.refresh();
		} catch {
			// állapotfrissítés nem kritikus
		}
	}
}

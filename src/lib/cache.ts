// Apró offline cache: memóriában + localStorage-ban, stale-while-revalidate.
// Cél: oldalváltáskor ne ugráljon a felület töltőállapot miatt — a mentett adat
// azonnal látszik, a frissítés csendben a háttérben fut.

import { browser } from '$app/environment';

const STORE_KEY = 'leardy-cache-v1';
const MAX_ENTRIES = 60;

interface Entry {
	at: number;
	data: unknown;
}

const mem = new Map<string, Entry>();
let disk: Record<string, Entry> = {};
let diskLoaded = false;

function loadDisk(): void {
	if (!browser || diskLoaded) return;
	diskLoaded = true;
	try {
		const raw = localStorage.getItem(STORE_KEY);
		if (raw) {
			const parsed: unknown = JSON.parse(raw);
			if (parsed && typeof parsed === 'object') disk = parsed as Record<string, Entry>;
		}
	} catch {
		disk = {};
	}
}

function persist(): void {
	if (!browser) return;
	try {
		const keys = Object.keys(disk);
		if (keys.length > MAX_ENTRIES) {
			const sorted = keys
				.map((k) => [k, disk[k].at] as const)
				.sort((a, b) => a[1] - b[1]);
			for (let i = 0; i < sorted.length - MAX_ENTRIES; i++) delete disk[sorted[i][0]];
		}
		localStorage.setItem(STORE_KEY, JSON.stringify(disk));
	} catch {
		// tárhely tele / tiltva: a memória-cache attól még működik
		try {
			localStorage.removeItem(STORE_KEY);
		} catch {
			// noop
		}
		disk = {};
	}
}

/** Azonnali olvasás renderhez (nincs várakozás). */
export function peek<T>(key: string): T | undefined {
	loadDisk();
	const hit = mem.get(key) ?? disk[key];
	return hit ? (hit.data as T) : undefined;
}

export interface Cached<T> {
	data: T;
	/** false = hálózati hiba miatt régi adatot adtunk vissza */
	fresh: boolean;
}

/**
 * Ha van TTL-en belüli mentés, azt adjuk; ha lejárt, háttérben frissítünk.
 * @param revalidate lejárt mentésnél is azonnal visszaadjuk a régit, és frissítünk mellé.
 */
export async function get<T>(
	key: string,
	fetcher: () => Promise<T>,
	ttlMs = 30000,
	revalidate = true
): Promise<Cached<T>> {
	loadDisk();
	const now = Date.now();
	const hit = mem.get(key) ?? disk[key];
	if (hit && now - hit.at < ttlMs) {
		mem.set(key, hit);
		return { data: hit.data as T, fresh: true };
	}
	if (hit && revalidate) {
		// Régi adat azonnal + csendes frissítés (a hívó újrahívhatja később).
		void fetcher()
			.then((data) => {
				const e: Entry = { at: Date.now(), data };
				mem.set(key, e);
				disk[key] = e;
				persist();
			})
			.catch(() => {
				// csendes: marad a régi
			});
		mem.set(key, hit);
		return { data: hit.data as T, fresh: true };
	}
	try {
		const data = await fetcher();
		const e: Entry = { at: now, data };
		mem.set(key, e);
		disk[key] = e;
		persist();
		return { data, fresh: true };
	} catch (err) {
		if (hit) {
			mem.set(key, hit);
			return { data: hit.data as T, fresh: false };
		}
		throw err;
	}
}

export function set<T>(key: string, data: T): void {
	loadDisk();
	const e: Entry = { at: Date.now(), data };
	mem.set(key, e);
	disk[key] = e;
	persist();
}

/** Előtag alapján érvénytelenítés (pl. 'topics' mindent visz: lista + részletező). */
export function invalidate(prefix: string): void {
	loadDisk();
	for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.delete(k);
	let touched = false;
	for (const k of Object.keys(disk)) {
		if (k.startsWith(prefix)) {
			delete disk[k];
			touched = true;
		}
	}
	if (touched) persist();
}

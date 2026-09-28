import type { SubjectTree } from './curriculum';
import { browser } from '$app/environment';

/* Apró SWR-gyorstár az ugrálás ellen. Szabályok:
   - friss találat (ttl) → azonnali rajz, hálózat nélkül;
   - lejárt, de még mutatható találat (staleTtl) → a régi adat marad a képernyőn,
     frissítés csendben a háttérben, skeleton nélkül;
   - a töltőjel csak akkor látszik, ha még sosem volt adat;
   - azonos kulcsra párhuzamosan csak egy hálózati kérés megy;
   - initben `prime()`-old a load() kulcsával és stale-ablakával, hogy az első
     paint se skeleton legyen (a load úgyis csak effectből/mountból futhat);
   - mentés után nem töltőképernyő jön, hanem csendes `touch()` vagy optimista
     `markLessonDone()`, ezért nem villan és nem ugrik a felület. */

interface Entry {
	data: unknown;
	at: number;
}

const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

/* Lemezes réteg: az olvasási modell (tantárgyak, fák, csomaglisták, könyvtár)
   túléli az újratöltést is, így hideg indításkor nulla hálózati kérésből
   rajzolunk. Csak kis méretű, előtaggal jelölt kulcsok kerülnek lemezre,
   a nagy kérdéslistákat a service worker HTTP-gyorstára fedi offline. */
const DISK_NS = 'leardy:q:v1:';
const DISK_PREFIXES = ['subjects', 'tree:', 'levels:', 'disc-', 'packages:', 'library', 'counts:'];
const DISK_MAX_CHARS = 256_000;
const DISK_DEFAULT_MS = 24 * 3_600_000;

function shouldPersist(key: string): boolean {
	return DISK_PREFIXES.some((p) => (p.endsWith(':') || p.endsWith('-') ? key.startsWith(p) : key === p || key.startsWith(`${p}:`)));
}

function readDisk<T>(key: string, maxAgeMs: number): T | undefined {
	if (!browser) return undefined;
	try {
		const raw = localStorage.getItem(DISK_NS + key);
		if (!raw) return undefined;
		const parsed = JSON.parse(raw) as { at?: unknown; data?: unknown };
		if (typeof parsed.at !== 'number' || Date.now() - parsed.at > maxAgeMs) return undefined;
		return parsed.data as T;
	} catch {
		return undefined;
	}
}

function writeDisk(key: string, data: unknown): void {
	if (!browser || !shouldPersist(key)) return;
	try {
		const raw = JSON.stringify({ at: Date.now(), data });
		if (raw.length > DISK_MAX_CHARS) return;
		try {
			localStorage.setItem(DISK_NS + key, raw);
		} catch {
			// Kvóta tele: a legrégebbi saját bejegyzések törlése, egy újrapróbálkozás.
			evictDisk();
			try {
				localStorage.setItem(DISK_NS + key, raw);
			} catch {
				// továbbra sem fér: eldobjuk
			}
		}
	} catch {
		// nem szerializálható: eldobjuk
	}
}

function evictDisk(): void {
	try {
		const keys: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k && k.startsWith(DISK_NS)) keys.push(k);
		}
		// A legrégebbi negyed törlése at szerint rendezve.
		const stamped = keys
			.map((k) => {
				try {
					const p = JSON.parse(localStorage.getItem(k) ?? '') as { at?: unknown };
					return { k, at: typeof p.at === 'number' ? p.at : 0 };
				} catch {
					return { k, at: 0 };
				}
			})
			.sort((a, b) => a.at - b.at);
		for (const e of stamped.slice(0, Math.max(1, Math.floor(stamped.length / 4)))) {
			localStorage.removeItem(e.k);
		}
	} catch {
		// tiltott storage
	}
}

/** A lemezes olvasási gyorstár ürítése (pl. kijelentkezéskor, hogy a
 *  személyes done-jelölések ne szivárogjanak át másik fiókba). */
export function clearPersistedCache(): void {
	if (!browser) return;
	try {
		const doomed: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k && k.startsWith(DISK_NS)) doomed.push(k);
		}
		for (const k of doomed) localStorage.removeItem(k);
	} catch {
		// tiltott storage
	}
	try {
		if (typeof caches !== 'undefined') void caches.delete('leardy-api-v1');
	} catch {
		// nincs CacheStorage
	}
}

function fresh<T>(key: string, ttlMs: number): T | undefined {
	const e = mem.get(key);
	if (e && Date.now() - e.at <= ttlMs) return e.data as T;
	// Memóriamellé: lemezről visszaolvasva azonnali rajz újratöltés után is.
	const disk = readDisk<T>(key, ttlMs);
	if (disk !== undefined) {
		mem.set(key, { data: disk, at: Date.now() });
		return disk;
	}
	return undefined;
}

/** Memóriatalálat hálózat nélkül, vagy undefined. */
export function peek<T>(key: string, ttlMs = 60_000): T | undefined {
	return fresh<T>(key, ttlMs);
}

/** Dedupolt lekérés: találatnál azonnal ad, különben egyetlen közös promise. Hiba nem tárolódik.
 *  `persistMs > 0` esetén sikerkor lemezre is ír (újratöltés túlélése). */
export async function getOrFetch<T>(
	key: string,
	fetcher: () => Promise<T>,
	ttlMs = 60_000,
	persistMs = DISK_DEFAULT_MS
): Promise<T> {
	const hit = fresh<T>(key, ttlMs);
	if (hit !== undefined) return hit;
	const ongoing = inflight.get(key);
	if (ongoing) return ongoing as Promise<T>;
	const p = fetcher()
		.then((data) => {
			mem.set(key, { data, at: Date.now() });
			if (persistMs > 0) writeDisk(key, data);
			return data;
		})
		.finally(() => {
			if (inflight.get(key) === p) inflight.delete(key);
		});
	inflight.set(key, p);
	return p;
}

/** Kulcsok törlése pontos egyezésre vagy előtagra. Ritkán kell. */
export function invalidate(prefix: string): void {
	for (const key of [...mem.keys()]) {
		if (key === prefix || key.startsWith(prefix)) mem.delete(key);
	}
}

/** Lista-állapot oldalakhoz: data / loading / error. A `load`-ot kulcsváltáskor $effect-ből hívd. */
export class Query<T> {
	data = $state<T | undefined>(undefined);
	loading = $state(true);
	error = $state(false);
	private last: { key: string; fetcher: () => Promise<T>; ttlMs: number } | null = null;
	private seq = 0;

	/** Szinkron előtöltés a memóriából és a lemezről, hálózat nélkül.
	    Komponens-initben hívd ugyanazzal a kulccsal és a load() stale-ablakával,
	    hogy visszalépéskor (és újratöltés után) az első paint rögtön adatot mutasson. */
	prime(key: string | null, staleTtlMs = 60_000): void {
		if (!key) return;
		const hit = fresh<T>(key, staleTtlMs);
		if (hit !== undefined) {
			this.data = hit;
			this.loading = false;
			this.error = false;
		}
	}

	load(
		key: string | null,
		fetcher: () => Promise<T>,
		ttlMs = 60_000,
		staleTtlMs = ttlMs,
		persistMs = DISK_DEFAULT_MS
	): void {
		const run = ++this.seq;
		if (!key) {
			this.last = null;
			this.data = undefined;
			this.loading = false;
			this.error = false;
			return;
		}
		this.last = { key, fetcher, ttlMs };
		// SSR alatt nincs hálózat (és a modul-szintű mem sem kéréseken átívelő):
		// a kliens hydráláskor prime-ol és tölt.
		if (!browser) return;
		const hit = fresh<T>(key, ttlMs);
		if (hit !== undefined) {
			// Azonnali rajz a régi adatból, frissítés csendben a háttérben.
			this.data = hit;
			this.loading = false;
			this.error = false;
			void getOrFetch(key, fetcher, 0, persistMs).then(
				(data) => {
					if (run === this.seq) this.data = data;
				},
				() => {
					// Hiba esetén a régi adat marad, némán.
				}
			);
			return;
		}
		const stale = staleTtlMs > ttlMs ? fresh<T>(key, staleTtlMs) : undefined;
		if (stale !== undefined) {
			// Öreg adat a képernyőn, frissítés csendben; skeleton nincs.
			this.data = stale;
			this.loading = false;
			this.error = false;
		} else {
			this.loading = true;
			this.error = false;
		}
		void getOrFetch(key, fetcher, ttlMs).then(
			(data) => {
				if (run !== this.seq) return;
				this.data = data;
				this.loading = false;
			},
			() => {
				if (run !== this.seq) return;
				this.loading = false;
				// Mutatott adat marad; hibaállapot csak üres képernyőnél.
				if (this.data === undefined) this.error = true;
			}
		);
	}

	/** Csendes frissítés az utolsó kulccsal: a mutatott adat megmarad, hiba esetén is. */
	touch(): void {
		if (!browser) return;
		const last = this.last;
		if (!last) return;
		const run = this.seq;
		void getOrFetch(last.key, last.fetcher, 0, DISK_DEFAULT_MS).then(
			(data) => {
				if (run === this.seq) this.data = data;
			},
			() => {}
		);
	}
}

interface HomeShape {
	suggestions?: { lessonId: string }[];
	todayDone?: number;
}

/** Lecke készre írása minden tárolt fában és home-javaslatban.
    Mire visszalépsz a listára, már zöld a pipa, újratöltés nélkül.
    A lemezes másolat is frissül, hogy újratöltés után se vesszen el a pipa. */
export function markLessonDone(lessonId: string): void {
	if (!lessonId) return;
	for (const [key, entry] of mem) {
		const d = entry.data as (Partial<SubjectTree> & HomeShape) | null | undefined;
		if (!d || typeof d !== 'object') continue;
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
			entry.at = Date.now();
			writeDisk(key, d);
		}
	}
}

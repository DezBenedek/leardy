/* SM-2 alapú ütemező szókártyákhoz.
   Takarékos tárolás: kártyánként egyetlen sor a card_progress táblában,
   csak a már megérintett kártyákhoz jön létre sor, új sor ismétléskor nem keletkezik.
   Bináris osztályzás: Tudom = quality 4, Nem tudom = quality 1. */

export interface SM2Mark {
	known: number;
	seen: number;
	repetitions: number;
	ease: number;
	intervalDays: number;
	dueDay: number;
}

export const SM2_DEFAULT_EASE = 2.5;
export const SM2_MIN_EASE = 1.3;
export const SM2_QUALITY_KNOWN = 4;
export const SM2_QUALITY_UNKNOWN = 1;

export function todayDay(nowMs: number = Date.now()): number {
	// A kliens és a szerver ugyanakkor váltson napot, téli és nyári időszámításkor is.
	const parts = new Intl.DateTimeFormat('en', {
		timeZone: 'Europe/Budapest', year: 'numeric', month: 'numeric', day: 'numeric'
	}).formatToParts(nowMs);
	const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	return Math.floor(Date.UTC(value('year'), value('month') - 1, value('day')) / 86_400_000);
}

export function qualityFor(known: boolean): number {
	return known ? SM2_QUALITY_KNOWN : SM2_QUALITY_UNKNOWN;
}

export interface SM2Result {
	repetitions: number;
	ease: number;
	intervalDays: number;
}

/** Klasszikus SM-2 lépés, a felhasználó példája alapján TypeScriptre írva. */
export function calculateSM2(
	quality: number,
	repetitions: number,
	easeFactor: number,
	interval: number
): SM2Result {
	quality = Math.max(0, Math.min(5, Math.round(num(quality, 0))));
	let nextInterval = Math.max(0, num(interval, 0));
	let nextReps = Math.max(0, Math.floor(num(repetitions, 0)));
	let nextEase = Math.max(SM2_MIN_EASE, Math.min(3.2, num(easeFactor, SM2_DEFAULT_EASE)));

	if (quality >= 3) {
		if (nextReps === 0) nextInterval = 1;
		else if (nextReps === 1) nextInterval = 6;
		else nextInterval = Math.max(1, Math.ceil(nextInterval * nextEase));
		nextReps += 1;
	} else {
		nextReps = 0;
		nextInterval = 1;
	}

	nextEase = nextEase + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
	if (nextEase < SM2_MIN_EASE) nextEase = SM2_MIN_EASE;
	// Felső korlát a túl ritka ismétlés ellen.
	if (nextEase > 3.2) nextEase = 3.2;
	if (!Number.isFinite(nextEase)) nextEase = SM2_DEFAULT_EASE;
	if (!Number.isFinite(nextInterval) || nextInterval < 1) nextInterval = 1;
	if (nextInterval > 3650) nextInterval = 3650;

	return { repetitions: nextReps, ease: round2(nextEase), intervalDays: nextInterval };
}

export function gradeSM2(
	current: Partial<SM2Mark> | null | undefined,
	known: boolean,
	today: number = todayDay()
): SM2Mark & { quality: number } {
	const reps = num(current?.repetitions, 0);
	const ease = num(current?.ease, SM2_DEFAULT_EASE);
	const interval = num(current?.intervalDays, 0);
	const seen = num(current?.seen, 0);
	const knownCount = num(current?.known, 0);
	const quality = qualityFor(known);
	const isEarlyReview = seen > 0 && num(current?.dueDay, 0) > today;
	// Egy napon belüli gyakorlás nem növelheti többször az ismétlési időt.
	// A hibás szó sikeres újrapróbálása az első, egynapos lépésre kerül vissza.
	const keepSchedule = isEarlyReview && ((known && reps > 0) || (!known && reps === 0));
	const next = keepSchedule
		? { repetitions: reps, ease, intervalDays: interval }
		: calculateSM2(quality, reps, ease, interval);
	return {
		known: known ? (isEarlyReview && reps > 0 ? knownCount : knownCount + 1) : 0,
		seen: seen + 1,
		repetitions: next.repetitions,
		ease: next.ease,
		intervalDays: next.intervalDays,
		dueDay: keepSchedule ? num(current?.dueDay, today + next.intervalDays) : today + next.intervalDays,
		quality
	};
}

function num(v: unknown, fallback: number): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function round2(v: number): number {
	return Math.round(v * 100) / 100;
}

/* Nyelvi tantárgy felismerése cím és azonosító alapján.
   Angol, Német, Olasz, Spanyol tantárgyban mindig Szókártya,
   minden más tantárgyban mindig Tanulókártya. */
const LANG_NORMS = ['angol', 'nemet', 'olasz', 'spanyol'] as const;
export type LanguageKey = 'angol' | 'német' | 'olasz' | 'spanyol';

function normHuLower(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

export function languageKeyForTitle(title: string): LanguageKey | null {
	const n = normHuLower(title ?? '');
	if (n.includes('angol')) return 'angol';
	if (n.includes('nemet')) return 'német';
	if (n.includes('olasz')) return 'olasz';
	if (n.includes('spanyol')) return 'spanyol';
	return null;
}

export function isLanguageSubject(
	title?: string | null,
	icon?: string | null,
	subjectId?: string | null
): boolean {
	if (title && languageKeyForTitle(title)) return true;
	if (subjectId) {
		const n = normHuLower(subjectId);
		if (LANG_NORMS.some((k) => n.includes(k))) return true;
	}
	// Tartalék jel: a nyelvi ikonnal jelölt tantárgy is nyelvnek számít.
	if (icon === 'languages' && title) return true;
	return false;
}

/** Automatikus csomagtípus: nyelvnél Szókártya (word), máshol Tanulókártya (study). */
export function cardKindForSubject(
	title?: string | null,
	icon?: string | null,
	subjectId?: string | null
): 'word' | 'study' {
	// Besorolatlan saját csomagból szókártya lesz, hogy tanulható maradjon.
	if (!title && !subjectId) return 'word';
	return isLanguageSubject(title, icon, subjectId) ? 'word' : 'study';
}

/* Gyakorló sorrend SM-2 alapján, kevés olvasással.
   Alapból az összes esedékes és új szó jön, a még nem esedékes nem:
   amit már tudsz, az csak holnap vagy később tér vissza.
   Direkt csomagnyitásnál (includeFuture) semmi nem marad ki, minden jön.
   Nyugodt, csomagonkénti sorrend: egy csomag kártyái mindig együtt jönnek,
   csomagon belül lejárt esedékes, aztán új.
   A legutóbb megnyitott csomagok vannak elöl, a többi a megadott
   csomagsorrendben. Nincs keverés: a sorrend stabil, ismétléskor ugyanaz. */

export interface QueueMeta {
	isNew: boolean;
	isDue: boolean;
	isFuture: boolean;
	recent: boolean;
}

export interface QueuedCard<T> {
	item: T;
	id: string;
	meta: QueueMeta;
	dueDay: number;
}

interface WordQueueOptions {
	today?: number;
	recentPackIds?: Set<string> | string[];
	cardToPack?: Map<string, string> | Record<string, string>;
	packOrder?: string[];
	/** A még nem esedékes kártyák is bekerülnek. */
	includeFuture?: boolean;
}

export function buildWordQueue<T extends { id: string }>(
	questions: T[],
	progress: Record<string, Partial<SM2Mark> | undefined>,
	opts: WordQueueOptions = {}
): QueuedCard<T>[] {
	const today = opts.today ?? todayDay();
	const recent =
		opts.recentPackIds instanceof Set
			? [...opts.recentPackIds]
			: [...(opts.recentPackIds ?? [])];
	const toPack =
		opts.cardToPack instanceof Map
			? opts.cardToPack
			: new Map(Object.entries(opts.cardToPack ?? {}));
	const orderRank = new Map<string, number>();
	for (const id of opts.packOrder ?? []) {
		if (!orderRank.has(id)) orderRank.set(id, orderRank.size);
	}

	// Csomagrangsor: a nemrég megnyitottak elöl (megnyitási sorrendben),
	// aztán a megadott csomagsorrend, az ismeretlen a legvégén.
	function packRank(packId: string): number {
		const ri = recent.indexOf(packId);
		if (ri >= 0) return ri - 1_000_000;
		const oi = orderRank.get(packId);
		if (oi !== undefined) return oi;
		return 1_000_000;
	}

	const all: { entry: QueuedCard<T>; packId: string; status: number; index: number }[] = [];
	const added = new Set<string>();

	for (let i = 0; i < questions.length; i++) {
		const q = questions[i];
		if (added.has(q.id)) continue;
		added.add(q.id);
		const m = progress[q.id];
		const seen = typeof m?.seen === 'number' ? m.seen : 0;
		const reps = typeof m?.repetitions === 'number' ? m.repetitions : 0;
		const dueDay = typeof m?.dueDay === 'number' ? m.dueDay : 0;
		const packId = toPack.get(q.id) ?? '';
		const recentHit = packId ? recent.includes(packId) : false;
		const isNew = seen === 0 && reps === 0;
		const status = isNew ? 1 : dueDay <= today ? 0 : 2;
		const meta =
			status === 1
				? { isNew: true, isDue: true, isFuture: false, recent: recentHit }
				: status === 0
					? { isNew: false, isDue: true, isFuture: false, recent: recentHit }
					: { isNew: false, isDue: false, isFuture: true, recent: recentHit };
		all.push({ entry: { item: q, id: q.id, meta, dueDay: status === 1 ? 0 : dueDay }, packId, status, index: i });
	}

	all.sort((a, b) => {
		const pr = packRank(a.packId) - packRank(b.packId);
		if (pr !== 0) return pr;
		if (a.status !== b.status) return a.status - b.status;
		if (a.status === 0 && a.entry.dueDay !== b.entry.dueDay) return a.entry.dueDay - b.entry.dueDay;
		return a.index - b.index;
	});

	// A még nem esedékes (jövőbeli) kártya alapból nem kerül a sorba:
	// amit ma már tudtál, az újranyitáskor sem jön vissza.
	// Direkt csomagnyitásnál viszont semmi nem marad ki.
	const keep = opts.includeFuture ? all : all.filter((e) => e.status < 2);
	return keep.map((e) => e.entry);
}

/** Mindig indítható kör: előbb az esedékes szavak, ezek hiányában rövid átismétlés. */
export function buildDailyWordQueue<T extends { id: string }>(
	questions: T[],
	progress: Record<string, Partial<SM2Mark> | undefined>,
	opts: Omit<WordQueueOptions, 'includeFuture'> & { reviewCount?: number } = {}
): QueuedCard<T>[] {
	const scheduled = buildWordQueue(questions, progress, opts);
	if (scheduled.length > 0) return scheduled;
	const candidates = buildWordQueue(questions, progress, { ...opts, includeFuture: true })
		.map((entry) => ({ entry, random: Math.random() }));
	// A rövidebb sikeres sorozat és az alacsonyabb könnyűségi érték bizonytalanabb szót jelez.
	// Azonos tudásszintnél véletlen sorrend teszi változatossá a köröket.
	candidates.sort((a, b) => {
		const ma = progress[a.entry.id];
		const mb = progress[b.entry.id];
		return num(ma?.repetitions, 0) - num(mb?.repetitions, 0)
			|| num(ma?.ease, SM2_DEFAULT_EASE) - num(mb?.ease, SM2_DEFAULT_EASE)
			|| num(ma?.intervalDays, 0) - num(mb?.intervalDays, 0)
			|| a.random - b.random;
	});
	const count = Math.max(1, Math.floor(num(opts.reviewCount, 20)));
	return candidates.slice(0, count).map(({ entry }) => entry);
}

export interface DueCounts {
	due: number;
	isNew: number;
	future: number;
	total: number;
	learned: number;
	nextDueDay: number | null;
}

/** Egy csomag SM-2 összesítése a részletező fejléchez. */
export function summarizeSM2<T extends { id: string }>(
	questions: T[],
	progress: Record<string, Partial<SM2Mark> | undefined>,
	today: number = todayDay()
): DueCounts {
	let due = 0;
	let isNew = 0;
	let future = 0;
	let learned = 0;
	let nextDue: number | null = null;
	const counted = new Set<string>();
	for (const q of questions) {
		if (counted.has(q.id)) continue;
		counted.add(q.id);
		const m = progress[q.id];
		const seen = typeof m?.seen === 'number' ? m.seen : 0;
		const reps = typeof m?.repetitions === 'number' ? m.repetitions : 0;
		const known = typeof m?.known === 'number' ? m.known : 0;
		const dueDay = typeof m?.dueDay === 'number' ? m.dueDay : 0;
		if (known >= 2) learned += 1;
		if (seen === 0 && reps === 0) {
			isNew += 1;
			due += 1;
		} else if (dueDay <= today) {
			due += 1;
		} else {
			future += 1;
			if (nextDue === null || dueDay < nextDue) nextDue = dueDay;
		}
	}
	return { due, isNew, future, total: counted.size, learned, nextDueDay: nextDue };
}

export function nextReviewText(dueDay: number | null, today: number = todayDay()): string {
	if (dueDay === null) return 'Most nincs beütemezett ismétlés.';
	const diff = dueDay - today;
	if (diff <= 0) return 'Van még esedékes szó.';
	if (diff === 1) return 'A következő ismétlés holnap esedékes.';
	return `A következő ismétlés ${diff} nap múlva esedékes.`;
}

export function formatDueDay(dueDay: number | null, today: number = todayDay()): string {
	if (dueDay === null) return 'nincs beütemezett ismétlés';
	const diff = dueDay - today;
	if (diff <= 0) return 'ma esedékes';
	if (diff === 1) return 'holnap esedékes';
	return `${diff} nap múlva esedékes`;
}

export function formatInterval(days: number): string {
	if (days <= 1) return 'holnap jön újra';
	return `${days} nap múlva jön újra`;
}

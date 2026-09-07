// Helyi-first adatréteg (localStorage). Minden funkció azonnal működik,
// backend nélkül is — a D1-szinkron később erre az interfészre épülhet.
// Modell: a régi rendszer domain/models.dart + streak.dart logikája alapján.
import { bumpLevel, freshSrs, gradeSrs, xpForGrade, type Grade, type SrsState } from './srs.js';

export type Lang = 'hu' | 'en';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface Reminder {
	enabled: boolean;
	hour: number;
	minute: number;
}

export interface Profile {
	name: string;
	xp: number;
	streak: number;
	lastActiveDay: string; // YYYY-MM-DD
	dailyGoal: number;
	lang: Lang;
	theme: ThemeMode;
	reminder: Reminder;
}

/** Tantárgy — a régi SubjectView egyszerűsített megfelelője. */
export interface Subject {
	id: string;
	name: string;
	colorKey: SubjectColorKey;
}

export type SubjectColorKey = 'ochre' | 'slate' | 'forest' | 'wine';

export interface Deck {
	id: string;
	subjectId: string;
	name: string;
	description: string;
	color: DeckColor;
	createdAt: number;
}

export type DeckColor = 'emerald' | 'sky' | 'violet' | 'amber' | 'rose';

export interface Card {
	id: string;
	deckId: string | null;
	lessonId: string | null;
	front: string;
	back: string;
	hint: string;
	example: string;
	exampleHu: string;
	/** Tudásszint-számláló: 0-ról indul, helyes +1, rontott −1 (0–4). */
	level: number;
	createdAt: number;
}

export interface LessonProgress {
	stars: number;
	best: number; // legjobb %
	doneAt: number | null;
}

export interface QuizResult {
	id: string;
	scope: 'lesson' | 'doga' | 'practice';
	refId: string;
	refName: string;
	memberId: string;
	memberName: string;
	score: number;
	total: number;
	xp: number;
	at: number;
	ms?: number;
}

export interface Member {
	id: string;
	name: string;
	xp: number;
	you?: boolean;
}

export interface GroupMaterial {
	id: string;
	title: string;
	url: string;
	note: string;
}

export interface Group {
	id: string;
	name: string;
	langLabel: string;
	code: string;
	ownerId: string;
	members: Member[];
	sharedDeckIds: string[];
	materials: GroupMaterial[];
}

export interface DB {
	version: number;
	profile: Profile;
	subjects: Subject[];
	decks: Deck[];
	cards: Card[];
	srs: Record<string, SrsState>;
	lessons: Record<string, LessonProgress>;
	results: QuizResult[];
	groups: Group[];
	/** nap -> átnézett kártyák száma */
	activity: Record<string, number>;
}

const KEY = 'leardy-db-v1';
const VERSION = 4;

export function uid(prefix = 'id'): string {
	return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function dayKey(d: Date = new Date()): string {
	const m = `${d.getMonth() + 1}`.padStart(2, '0');
	const day = `${d.getDate()}`.padStart(2, '0');
	return `${d.getFullYear()}-${m}-${day}`;
}

function yesterdayKey(from = new Date()): string {
	const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
	d.setDate(d.getDate() - 1);
	return dayKey(d);
}

/** Naptári napokkal lép — DST-átálláskor is pontos (nem 24 órával von ki). */
function shiftDay(d: Date, delta: number): Date {
	const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	out.setDate(out.getDate() + delta);
	return out;
}

/** Sorozat a tényleges aktív napokból (régi streak.dart: streakFromDates). */
export function streakFromDates(days: Iterable<string>, today = new Date()): number {
	const set = new Set(days);
	let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const fmt = (d: Date) => dayKey(d);
	if (!set.has(fmt(cursor))) {
		cursor = shiftDay(cursor, -1);
		if (!set.has(fmt(cursor))) return 0;
	}
	let streak = 0;
	while (set.has(fmt(cursor))) {
		streak += 1;
		cursor = shiftDay(cursor, -1);
	}
	return streak;
}

/** Elmúlt 28 nap napi számlálói, legrégebbtől a máig (régi last28Counts). */
export function last28Counts(byDate: Record<string, number>, today = new Date()): number[] {
	const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	return Array.from({ length: 28 }, (_, i) => {
		const d = shiftDay(base, i - 27);
		return byDate[dayKey(d)] ?? 0;
	});
}

type SeedCard = [front: string, back: string, example: string, exampleHu: string];

const LESSONS_META: { id: string; hu: string; en: string; subHu: string; subEn: string }[] = [
	{ id: 'lesson-1', hu: 'Köszönések', en: 'Greetings', subHu: 'Az első szavak', subEn: 'First words' },
	{ id: 'lesson-2', hu: 'Család és otthon', en: 'Family & home', subHu: 'Akik körülvesznek', subEn: 'People around you' },
	{ id: 'lesson-3', hu: 'Ételek és italok', en: 'Food & drinks', subHu: 'A konyhában', subEn: 'In the kitchen' },
	{ id: 'lesson-4', hu: 'Számok és idő', en: 'Numbers & time', subHu: 'Számoljunk!', subEn: "Let's count!" },
	{ id: 'lesson-5', hu: 'Utazás', en: 'Travel', subHu: 'Úton-útfélen', subEn: 'On the road' }
];

const LESSON_CARDS: Record<string, SeedCard[]> = {
	'lesson-1': [
		['hello', 'szia', 'Hello! How are you?', 'Szia! Hogy vagy?'],
		['good morning', 'jó reggelt', 'Good morning, Anna!', 'Jó reggelt, Anna!'],
		['good evening', 'jó estét', 'Good evening, everyone.', 'Jó estét mindenkinek.'],
		['goodbye', 'viszlát', 'Goodbye! See you tomorrow.', 'Viszlát! Holnap találkozunk.'],
		['please', 'kérlek', 'Sit down, please.', 'Kérlek, ülj le.'],
		['thank you', 'köszönöm', 'Thank you very much.', 'Nagyon köszönöm.'],
		['yes', 'igen', 'Yes, I understand.', 'Igen, értem.'],
		['no', 'nem', 'No, thank you.', 'Nem, köszönöm.']
	],
	'lesson-2': [
		['mother', 'anya', 'My mother is kind.', 'Az anyukám kedves.'],
		['father', 'apa', 'My father works a lot.', 'Apukám sokat dolgozik.'],
		['brother', 'fiútestvér', 'I have one brother.', 'Egy fiútestvérem van.'],
		['sister', 'lánytestvér', 'My sister is ten.', 'A lánytestvérem tízéves.'],
		['family', 'család', 'My family is big.', 'Nagy a családom.'],
		['friend', 'barát', 'He is my best friend.', 'Ő a legjobb barátom.'],
		['home', 'otthon', 'I am at home.', 'Otthon vagyok.'],
		['child', 'gyerek', 'The child is happy.', 'A gyerek boldog.']
	],
	'lesson-3': [
		['apple', 'alma', 'I eat an apple.', 'Eszem egy almát.'],
		['bread', 'kenyér', 'Fresh bread is good.', 'A friss kenyér finom.'],
		['water', 'víz', 'A glass of water, please.', 'Egy pohár vizet kérek.'],
		['milk', 'tej', 'The milk is cold.', 'A tej hideg.'],
		['egg', 'tojás', 'Two eggs for breakfast.', 'Két tojás reggelire.'],
		['cheese', 'sajt', 'I like cheese.', 'Szeretem a sajtot.'],
		['fish', 'hal', 'Fish is healthy.', 'A hal egészséges.'],
		['coffee', 'kávé', 'Black coffee, please.', 'Fekete kávét kérek.']
	],
	'lesson-4': [
		['one', 'egy', 'One ticket, please.', 'Egy jegyet kérek.'],
		['two', 'kettő', 'Two children.', 'Két gyerek.'],
		['three', 'három', 'Three apples.', 'Három alma.'],
		['day', 'nap', 'A beautiful day.', 'Egy szép nap.'],
		['week', 'hét', 'Seven days make a week.', 'Hét nap egy hét.'],
		['today', 'ma', 'I am busy today.', 'Ma elfoglalt vagyok.'],
		['tomorrow', 'holnap', 'See you tomorrow.', 'Holnap találkozunk.'],
		['time', 'idő', 'What time is it?', 'Hány óra van?']
	],
	'lesson-5': [
		['train', 'vonat', 'The train is fast.', 'A vonat gyors.'],
		['bus', 'busz', 'I take the bus.', 'Busszal megyek.'],
		['ticket', 'jegy', 'Two tickets to London.', 'Két jegyet Londonba.'],
		['station', 'állomás', 'Where is the station?', 'Hol van az állomás?'],
		['city', 'város', 'Budapest is a beautiful city.', 'Budapest egy szép város.'],
		['street', 'utca', 'This street is long.', 'Ez az utca hosszú.'],
		['map', 'térkép', 'Look at the map.', 'Nézd meg a térképet.'],
		['hotel', 'szálloda', 'The hotel is near.', 'A szálloda közel van.']
	]
};

const STARTER_CARDS: SeedCard[] = [
	['dog', 'kutya', 'The dog is big.', 'A kutya nagy.'],
	['cat', 'macska', 'The cat sleeps.', 'A macska alszik.'],
	['book', 'könyv', 'I read a book.', 'Olvasok egy könyvet.'],
	['house', 'ház', 'A small house.', 'Egy kis ház.'],
	['car', 'autó', 'My car is red.', 'Az autóm piros.'],
	['tree', 'fa', 'A tall tree.', 'Egy magas fa.'],
	['flower', 'virág', 'A nice flower.', 'Egy szép virág.'],
	['sun', 'nap', 'The sun shines.', 'Süt a nap.'],
	['moon', 'hold', 'The moon is round.', 'A hold kerek.'],
	['star', 'csillag', 'A bright star.', 'Egy fényes csillag.']
];

export function lessonMeta() {
	return LESSONS_META;
}

function seed(): DB {
	const now = Date.now();
	const cards: Card[] = [];
	for (const meta of LESSONS_META) {
		for (const [front, back, example, exampleHu] of LESSON_CARDS[meta.id]) {
			cards.push({
				id: `card-${meta.id}-${front.replace(/[^a-z]/g, '')}`,
				deckId: null,
				lessonId: meta.id,
				front,
				back,
				hint: '',
				example,
				exampleHu,
				level: 0,
				createdAt: now
			});
		}
	}
	for (const [front, back, example, exampleHu] of STARTER_CARDS) {
		cards.push({
			id: `card-starter-${front}`,
			deckId: 'deck-starter',
			lessonId: null,
			front,
			back,
			hint: '',
			example,
			exampleHu,
			level: 0,
			createdAt: now
		});
	}

	const lessons: Record<string, LessonProgress> = {};
	for (const meta of LESSONS_META) {
		lessons[meta.id] = { stars: 0, best: 0, doneAt: null };
	}

	return {
		version: VERSION,
		profile: {
			name: '',
			xp: 0,
			streak: 0,
			lastActiveDay: '',
			dailyGoal: 10,
			lang: 'hu',
			theme: 'system',
			reminder: { enabled: false, hour: 19, minute: 0 }
		},
		subjects: [{ id: 'subj-en', name: 'Angol', colorKey: 'slate' }],
		decks: [
			{
				id: 'deck-starter',
				subjectId: 'subj-en',
				name: 'Első szavaim',
				description: 'Kezdő szavak — innen érdemes indulni.',
				color: 'emerald',
				createdAt: now
			}
		],
		cards,
		srs: {},
		lessons,
		results: [
			{
				id: 'res-seed-1',
				scope: 'doga',
				refId: 'deck-starter',
				refName: 'Első szavaim',
				memberId: 'm-anna',
				memberName: 'Anna',
				score: 8,
				total: 10,
				xp: 80,
				at: now - 86_400_000
			}
		],
		groups: [
			{
				id: 'group-a1',
				name: 'Angol A1 – Esti csoport',
				langLabel: 'Angol',
				code: 'A1-ESTI',
				ownerId: 'm-you',
				members: [
					{ id: 'm-you', name: '', xp: 0, you: true },
					{ id: 'm-anna', name: 'Anna', xp: 340 },
					{ id: 'm-bence', name: 'Bence', xp: 210 },
					{ id: 'm-csilla', name: 'Csilla', xp: 120 }
				],
				sharedDeckIds: ['deck-starter'],
				materials: [
					{ id: 'mat-seed-1', title: 'A1 szószedet (PDF)', url: '', note: 'Az első 5 lecke összes szava.' }
				]
			}
		],
		activity: {}
	};
}

/** v3 → v4 migráció: megőrzi a felhasználó adatait. */
function migrate(old: Record<string, unknown>): DB {
	const fresh = seed();
	const o = old as unknown as DB;
	try {
		if (Array.isArray(o.subjects) && o.subjects.length > 0) fresh.subjects = o.subjects;
		if (Array.isArray(o.decks)) {
			fresh.decks = o.decks.map((d) => ({
				...d,
				subjectId: (d as Deck).subjectId ?? 'subj-en'
			})) as Deck[];
		}
		if (Array.isArray(o.cards)) {
			fresh.cards = o.cards.map((c) => {
				const cc = c as Card;
				return {
					...cc,
					hint: cc.hint ?? '',
					example: cc.example ?? '',
					exampleHu: (cc as Partial<Card>).exampleHu ?? '',
					level: cc.level ?? 0
				};
			});
		}
		if (o.srs && typeof o.srs === 'object') fresh.srs = o.srs;
		if (o.lessons && typeof o.lessons === 'object') fresh.lessons = o.lessons as DB['lessons'];
		if (Array.isArray(o.results)) fresh.results = o.results;
		if (Array.isArray(o.groups)) {
			fresh.groups = o.groups.map((g) => ({ ...(g as Group), materials: (g as Group).materials ?? [] }));
		}
		if (o.activity && typeof o.activity === 'object') fresh.activity = o.activity as DB['activity'];
		if (o.profile && typeof o.profile === 'object') {
			fresh.profile = {
				...(o.profile as Profile),
				theme: (o.profile as Profile).theme ?? 'system',
				reminder: (o.profile as Profile).reminder ?? { enabled: false, hour: 19, minute: 0 }
			};
		}
	} catch {
		return seed();
	}
	fresh.version = VERSION;
	return fresh;
}

function load(): DB {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return seed();
		const parsed = JSON.parse(raw) as DB;
		if (!parsed || !parsed.profile || !Array.isArray(parsed.cards)) return seed();
		if (parsed.version !== VERSION) return migrate(parsed as unknown as Record<string, unknown>);
		return parsed;
	} catch {
		return seed();
	}
}

export interface DeckStats {
	total: number;
	due: number;
	fresh: number;
	mastered: number;
}

class Store {
	data = $state<DB>(typeof localStorage === 'undefined' ? seed() : load());

	save() {
		try {
			localStorage.setItem(KEY, JSON.stringify(this.data));
		} catch {
			/* tárhely tele / privát mód — az app memóriában tovább működik */
		}
	}

	reset() {
		this.data = seed();
		this.save();
	}

	replace(next: DB) {
		this.data = next.version === VERSION ? next : migrate(next as unknown as Record<string, unknown>);
		this.save();
	}

	// ---------- profil / XP / streak ----------

	/** XP-jóváírás + napi aktivitás + sorozat. Mindig ezen át menjen az XP. */
	addXp(amount: number, cardsReviewed = 0) {
		const p = this.data.profile;
		p.xp += amount;
		const today = dayKey();
		if (cardsReviewed > 0) {
			this.data.activity[today] = (this.data.activity[today] ?? 0) + cardsReviewed;
		}
		if (p.lastActiveDay !== today) {
			p.streak = p.lastActiveDay === yesterdayKey() ? p.streak + 1 : 1;
			p.lastActiveDay = today;
		}
		this.save();
	}

	setProfile(patch: Partial<Profile>) {
		Object.assign(this.data.profile, patch);
		if (patch.name !== undefined) {
			for (const g of this.data.groups) {
				const me = g.members.find((m) => m.you);
				if (me) me.name = patch.name;
			}
		}
		this.save();
	}

	todayCount(): number {
		return this.data.activity[dayKey()] ?? 0;
	}

	// ---------- tantárgyak ----------

	addSubject(name: string, colorKey: Subject['colorKey']): Subject {
		const s: Subject = { id: uid('subj'), name, colorKey };
		this.data.subjects.push(s);
		this.save();
		return s;
	}

	// ---------- paklik / kártyák ----------

	addDeck(name: string, description: string, color: DeckColor, subjectId: string): Deck {
		const deck: Deck = { id: uid('deck'), subjectId, name, description, color, createdAt: Date.now() };
		this.data.decks.push(deck);
		this.save();
		return deck;
	}

	updateDeck(id: string, patch: Partial<Pick<Deck, 'name' | 'description' | 'color' | 'subjectId'>>) {
		const d = this.data.decks.find((x) => x.id === id);
		if (d) Object.assign(d, patch);
		this.save();
	}

	deleteDeck(id: string) {
		this.data.decks = this.data.decks.filter((x) => x.id !== id);
		const cardIds = new Set(this.data.cards.filter((c) => c.deckId === id).map((c) => c.id));
		this.data.cards = this.data.cards.filter((c) => c.deckId !== id);
		for (const cid of cardIds) delete this.data.srs[cid];
		for (const g of this.data.groups) {
			g.sharedDeckIds = g.sharedDeckIds.filter((x) => x !== id);
		}
		this.save();
	}

	addCard(deckId: string, front: string, back: string, example: string, hint: string): Card {
		const card: Card = {
			id: uid('card'),
			deckId,
			lessonId: null,
			front,
			back,
			hint,
			example,
			exampleHu: '',
			level: 0,
			createdAt: Date.now()
		};
		this.data.cards.push(card);
		this.save();
		return card;
	}

	updateCard(id: string, patch: Partial<Pick<Card, 'front' | 'back' | 'example' | 'hint'>>) {
		const c = this.data.cards.find((x) => x.id === id);
		if (c) Object.assign(c, patch);
		this.save();
	}

	deleteCard(id: string) {
		this.data.cards = this.data.cards.filter((c) => c.id !== id);
		delete this.data.srs[id];
		this.save();
	}

	deckCards(deckId: string): Card[] {
		return this.data.cards.filter((c) => c.deckId === deckId);
	}

	lessonCards(lessonId: string): Card[] {
		return this.data.cards.filter((c) => c.lessonId === lessonId);
	}

	searchCards(query: string, limit = 30): Card[] {
		const q = query.trim().toLowerCase();
		if (q.length < 2) return [];
		return this.data.cards
			.filter(
				(c) =>
					c.front.toLowerCase().includes(q) ||
					c.back.toLowerCase().includes(q) ||
					(c.hint && c.hint.toLowerCase().includes(q))
			)
			.slice(0, limit);
	}

	deckStats(deckId: string, now = Date.now()): DeckStats {
		const cards = this.deckCards(deckId);
		let due = 0;
		let fresh = 0;
		let mastered = 0;
		for (const c of cards) {
			const s = this.data.srs[c.id];
			// Az esedékesbe az új (még nem látott) kártyák is beleszámítanak —
			// ugyanúgy, mint a home és a paklilista számlálóiban.
			if (!s) {
				fresh += 1;
				due += 1;
			} else if (s.due <= now) {
				due += 1;
			}
			if (c.level >= 4) mastered += 1;
		}
		return { total: cards.length, due, fresh, mastered };
	}

	// ---------- SRS ----------

	/** Osztályzás SRS-ütemezéssel + tudásszint-frissítéssel. */
	gradeCard(cardId: string, grade: Grade, now = Date.now()): number {
		const prev = this.data.srs[cardId] ?? freshSrs(cardId, now);
		this.data.srs[cardId] = gradeSrs(prev, grade, now);
		const card = this.data.cards.find((c) => c.id === cardId);
		if (card) card.level = bumpLevel(card.level, grade > 0);
		const xp = xpForGrade(grade);
		this.addXp(xp, 1);
		return xp;
	}

	/** Egyszerű helyes/rontott könyvelés (lecke, doga). */
	markCard(cardId: string, correct: boolean, now = Date.now()) {
		const card = this.data.cards.find((c) => c.id === cardId);
		if (card) card.level = bumpLevel(card.level, correct);
		const prev = this.data.srs[cardId] ?? freshSrs(cardId, now);
		this.data.srs[cardId] = gradeSrs(prev, correct ? 2 : 0, now);
		this.save();
	}

	dueCards(deckId?: string, now = Date.now(), limit = 20): Card[] {
		const pool = this.data.cards.filter((c) => {
			if (deckId && c.deckId !== deckId) return false;
			const s = this.data.srs[c.id];
			return !s || s.due <= now;
		});
		return pool
			.sort((a, b) => {
				const sa = this.data.srs[a.id];
				const sb = this.data.srs[b.id];
				if (!sa && sb) return -1;
				if (sa && !sb) return 1;
				return (sa?.due ?? 0) - (sb?.due ?? 0);
			})
			.slice(0, limit);
	}

	dueDeckIds(now = Date.now()): { id: string; due: number }[] {
		const map = new Map<string, number>();
		for (const c of this.data.cards) {
			if (!c.deckId) continue;
			const s = this.data.srs[c.id];
			if (!s || s.due <= now) map.set(c.deckId, (map.get(c.deckId) ?? 0) + 1);
		}
		return [...map.entries()].map(([id, due]) => ({ id, due }));
	}

	// ---------- leckék ----------

	lessonState(index: number): 'done' | 'open' | 'locked' {
		if (index === 0) return this.data.lessons[LESSONS_META[0].id]?.stars ? 'done' : 'open';
		const prev = this.data.lessons[LESSONS_META[index - 1].id];
		if (!prev || prev.stars < 1) return 'locked';
		const cur = this.data.lessons[LESSONS_META[index].id];
		return cur && cur.stars > 0 ? 'done' : 'open';
	}

	completeLesson(lessonId: string, pct: number, cardsReviewed = 0): { stars: number; xp: number; isRecord: boolean } {
		const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 50 ? 1 : 0;
		const prev = this.data.lessons[lessonId] ?? { stars: 0, best: 0, doneAt: null };
		const isRecord = pct > prev.best;
		const xp = stars > 0 ? 20 + stars * 5 + Math.round(pct / 10) : 5;
		this.data.lessons[lessonId] = {
			stars: Math.max(prev.stars, stars),
			best: Math.max(prev.best, pct),
			doneAt: stars > 0 ? Date.now() : prev.doneAt
		};
		this.addXp(xp, cardsReviewed);
		return { stars, xp, isRecord };
	}

	saveResult(r: Omit<QuizResult, 'id'>) {
		this.data.results.unshift({ ...r, id: uid('res') });
		this.data.results = this.data.results.slice(0, 100);
		this.save();
	}

	// ---------- csoportok ----------

	joinGroup(code: string): { ok: true; group: Group } | { ok: false; reason: 'invalid' | 'member' } {
		const group = this.data.groups.find((g) => g.code.toUpperCase() === code.trim().toUpperCase());
		if (!group) return { ok: false, reason: 'invalid' };
		if (group.members.some((m) => m.you)) return { ok: false, reason: 'member' };
		group.members.push({ id: 'm-you', name: this.data.profile.name, xp: this.data.profile.xp, you: true });
		this.save();
		return { ok: true, group };
	}

	createGroup(name: string): Group {
		const code = `${uid('').slice(-6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
		const group: Group = {
			id: uid('group'),
			name,
			langLabel: 'Angol',
			code: `LX-${code.slice(0, 4)}`,
			ownerId: 'm-you',
			members: [{ id: 'm-you', name: this.data.profile.name, xp: this.data.profile.xp, you: true }],
			sharedDeckIds: [],
			materials: []
		};
		this.data.groups.push(group);
		this.save();
		return group;
	}

	shareDeck(groupId: string, deckId: string) {
		const g = this.data.groups.find((x) => x.id === groupId);
		if (g && !g.sharedDeckIds.includes(deckId)) {
			g.sharedDeckIds.push(deckId);
			this.save();
		}
	}

	addMaterial(groupId: string, title: string, url: string, note: string) {
		const g = this.data.groups.find((x) => x.id === groupId);
		if (!g) return;
		g.materials.push({ id: uid('mat'), title, url, note });
		this.save();
	}

	deleteMaterial(groupId: string, materialId: string) {
		const g = this.data.groups.find((x) => x.id === groupId);
		if (!g) return;
		g.materials = g.materials.filter((m) => m.id !== materialId);
		this.save();
	}
}

export const store = new Store();

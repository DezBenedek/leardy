import type { LangCode } from './languages';

export interface Lesson {
	title: string;
	meta: string;
	done?: boolean;
	current?: boolean;
	locked?: boolean;
}

export interface Chapter {
	title: string;
	desc: string;
	lessons: Lesson[];
}

export interface Deck {
	name: string;
	count: number;
	due: number;
}

export interface FlashCard {
	front: string;
	back: string;
}

export interface LangStats {
	lessonsDone: number;
	lessonsTotal: number;
	xp: number;
	xpGoal: number;
	level: number;
}

export interface LangContent {
	stats: LangStats;
	currentLessonTitle: string;
	currentLessonMeta: string;
	chapters: Chapter[];
	decks: Deck[];
	cards: FlashCard[];
}

export const CONTENT: Record<LangCode, LangContent> = {
	en: {
		stats: { lessonsDone: 12, lessonsTotal: 40, xp: 320, xpGoal: 500, level: 12 },
		currentLessonTitle: 'Alap mondatszerkezetek',
		currentLessonMeta: '6 perc',
		chapters: [
			{
				title: '1. fejezet · Alapok',
				desc: 'Köszönések, bemutatkozás, alap mondatszerkezetek.',
				lessons: [
					{ title: 'Köszönések és bemutatkozás', meta: '5 perc · kész', done: true },
					{ title: 'Alap mondatszerkezetek', meta: '6 perc · 68%-nál tartasz', current: true },
					{ title: 'Kérdések és válaszok', meta: '5 perc', locked: true }
				]
			},
			{
				title: '2. fejezet · Mindennapok',
				desc: 'Család, munka, vásárlás, időpontok.',
				lessons: [
					{ title: 'Család és barátok', meta: '6 perc', locked: true },
					{ title: 'Napirend és idő', meta: '7 perc', locked: true },
					{ title: 'Vásárlás és étterem', meta: '6 perc', locked: true }
				]
			}
		],
		decks: [
			{ name: 'Alapszavak', count: 32, due: 8 },
			{ name: 'Utazás', count: 24, due: 5 },
			{ name: 'Üzleti angol', count: 30, due: 0 }
		],
		cards: [
			{ front: 'to achieve', back: 'elérni, megvalósítani' },
			{ front: 'journey', back: 'utazás, út' },
			{ front: 'to improve', back: 'fejleszteni, javítani' },
			{ front: 'challenge', back: 'kihívás' },
			{ front: 'appointment', back: 'időpont, találkozó' },
			{ front: 'delicious', back: 'finom, ízletes' }
		]
	},
	de: {
		stats: { lessonsDone: 5, lessonsTotal: 40, xp: 140, xpGoal: 500, level: 5 },
		currentLessonTitle: 'Igeragozás jelen időben',
		currentLessonMeta: '7 perc',
		chapters: [
			{
				title: '1. fejezet · Alapok',
				desc: 'Névelők, igeragozás, szórend — a német alapjai.',
				lessons: [
					{ title: 'Névelők: der, die, das', meta: '6 perc · kész', done: true },
					{ title: 'Igeragozás jelen időben', meta: '7 perc · 32%-nál tartasz', current: true },
					{ title: 'Kérdő mondatok', meta: '5 perc', locked: true }
				]
			},
			{
				title: '2. fejezet · Mindennapok',
				desc: 'Család, vásárlás, időpontok.',
				lessons: [
					{ title: 'Család és barátok', meta: '6 perc', locked: true },
					{ title: 'Vásárlás és ételek', meta: '6 perc', locked: true },
					{ title: 'Időpontok és találkozók', meta: '5 perc', locked: true }
				]
			}
		],
		decks: [
			{ name: 'Alapszavak', count: 28, due: 6 },
			{ name: 'Utazás', count: 20, due: 4 },
			{ name: 'Munka és hétköznapok', count: 18, due: 0 }
		],
		cards: [
			{ front: 'die Herausforderung', back: 'kihívás' },
			{ front: 'die Reise', back: 'utazás, út' },
			{ front: 'verbessern', back: 'fejleszteni, javítani' },
			{ front: 'der Termin', back: 'időpont' },
			{ front: 'lecker', back: 'finom' },
			{ front: 'erreichen', back: 'elérni' }
		]
	},
	it: {
		stats: { lessonsDone: 8, lessonsTotal: 40, xp: 210, xpGoal: 500, level: 8 },
		currentLessonTitle: 'Főnevek neme és száma',
		currentLessonMeta: '6 perc',
		chapters: [
			{
				title: '1. fejezet · Alapok',
				desc: 'Köszönések, főnevek, létige — az olasz alapjai.',
				lessons: [
					{ title: 'Köszönések: ciao, buongiorno', meta: '5 perc · kész', done: true },
					{ title: 'Főnevek neme és száma', meta: '6 perc · 51%-nál tartasz', current: true },
					{ title: 'Essere és avere', meta: '6 perc', locked: true }
				]
			},
			{
				title: '2. fejezet · Mindennapok',
				desc: 'Család, étterem, utazás.',
				lessons: [
					{ title: 'Család és barátok', meta: '5 perc', locked: true },
					{ title: 'Étterem és kávézó', meta: '6 perc', locked: true },
					{ title: 'Utazás és irányok', meta: '6 perc', locked: true }
				]
			}
		],
		decks: [
			{ name: 'Alapszavak', count: 24, due: 9 },
			{ name: 'Utazás', count: 18, due: 3 },
			{ name: 'Étterem és kávézó', count: 16, due: 0 }
		],
		cards: [
			{ front: 'la sfida', back: 'kihívás' },
			{ front: 'il viaggio', back: 'utazás, út' },
			{ front: 'migliorare', back: 'fejleszteni, javítani' },
			{ front: "l'appuntamento", back: 'időpont' },
			{ front: 'delizioso', back: 'finom' },
			{ front: 'raggiungere', back: 'elérni' }
		]
	},
	es: {
		stats: { lessonsDone: 3, lessonsTotal: 40, xp: 80, xpGoal: 500, level: 3 },
		currentLessonTitle: 'Ser vagy estar?',
		currentLessonMeta: '7 perc',
		chapters: [
			{
				title: '1. fejezet · Alapok',
				desc: 'Köszönések, ser/estar, névelők — a spanyol alapjai.',
				lessons: [
					{ title: 'Köszönések: hola, gracias', meta: '5 perc · kész', done: true },
					{ title: 'Ser vagy estar?', meta: '7 perc · 12%-nál tartasz', current: true },
					{ title: 'Névelők: el és la', meta: '5 perc', locked: true }
				]
			},
			{
				title: '2. fejezet · Mindennapok',
				desc: 'Család, étterem, vásárlás.',
				lessons: [
					{ title: 'Család és barátok', meta: '5 perc', locked: true },
					{ title: 'Étterem és tapas', meta: '6 perc', locked: true },
					{ title: 'Vásárlás és piac', meta: '6 perc', locked: true }
				]
			}
		],
		decks: [
			{ name: 'Alapszavak', count: 20, due: 7 },
			{ name: 'Utazás', count: 16, due: 2 },
			{ name: 'Mindennapok', count: 18, due: 0 }
		],
		cards: [
			{ front: 'el desafío', back: 'kihívás' },
			{ front: 'el viaje', back: 'utazás, út' },
			{ front: 'mejorar', back: 'fejleszteni, javítani' },
			{ front: 'la cita', back: 'időpont' },
			{ front: 'delicioso', back: 'finom' },
			{ front: 'lograr', back: 'elérni' }
		]
	}
};

/** Ma esedékes kártyák száma az adott nyelven. */
export function dueTotal(content: LangContent): number {
	return content.decks.reduce((sum, d) => sum + d.due, 0);
}

/** Az első pakli, amiben van ismételnivaló. */
export function nextDeck(content: LangContent): Deck {
	return content.decks.find((d) => d.due > 0) ?? content.decks[0];
}

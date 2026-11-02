// Futtatás: node --test scripts/test-lesson-json-import.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { typescriptModuleUrl } from './typescript-module.mjs';

const { importSectionsToContent, parseLessonJsonImport } = await import(
	await typescriptModuleUrl(new URL('../src/lib/curriculum/lesson-json-import.ts', import.meta.url))
);

const FULL = JSON.stringify({
	title: 'Az erdő állatai',
	sections: [
		{ title: 'Bevezetés', body: 'Az **erdőben** sok állat él.\n\n- róka\n- nyúl' },
		{ title: 'Róka', body: 'A róka ügyes vadász.' }
	],
	decks: [{ title: 'Állatok', cards: [{ front: 'róka', back: 'fox' }, { front: 'nyúl', back: 'rabbit' }] }],
	quiz: [
		{ type: 'choice', question: 'Melyik erdei állat?', options: ['róka', 'cápa', 'delfin'], answer: 'róka' },
		{ type: 'choice', question: 'Melyek emlősök?', options: ['róka', 'cápa', 'nyúl'], answer: ['róka', 'nyúl'] },
		{ type: 'true-false', question: 'A róka emlős.', answer: 'Igaz' },
		{ type: 'text', question: 'Mi a róka angolul?', answer: 'fox' },
		{ type: 'match', question: 'Párosíts!', pairs: [{ left: 'róka', right: 'fox' }, { left: 'nyúl', right: 'rabbit' }] },
		{ type: 'order', question: 'Sorrend', options: ['mag', 'csíra', 'fa'] },
		{ type: 'gap', question: 'Egészítsd ki!', text: 'A [[róka]] átugorja a [[kutyát]].', words: ['róka', 'kutyát', 'macska'] }
	]
});

test('teljes példa mindhárom résszel betöltődik', () => {
	const result = parseLessonJsonImport(FULL);
	assert.equal(result.title, 'Az erdő állatai');
	assert.equal(result.sections.length, 2);
	assert.equal(result.decks.length, 1);
	assert.equal(result.decks[0].cards.length, 2);
	assert.equal(result.questions.length, 7);
	assert.deepEqual(result.questions.map((q) => q.type), ['choice', 'choice', 'tf', 'text', 'match', 'order', 'gap']);
});

test('több helyes válasz multiple beállítást kap', () => {
	const result = parseLessonJsonImport(
		JSON.stringify({ quiz: [{ type: 'choice', question: 'Q?', options: ['a', 'b'], answer: ['a', 'b'] }] })
	);
	assert.equal(result.questions[0].settings?.multiple, true);
});

test('tf alias és gap szavak nélküli bankja működik', () => {
	const result = parseLessonJsonImport(
		JSON.stringify({
			quiz: [
				{ type: 'true-false', question: 'Q1?', answer: 'Hamis' },
				{ type: 'gap', question: 'Q2?', text: 'A [[róka]] fut.' }
			]
		})
	);
	assert.equal(result.questions[0].type, 'tf');
	assert.deepEqual(result.questions[1].options, []);
});

test('nagy csomag 200-as folytatásokra bomlik', () => {
	const cards = Array.from({ length: 450 }, (_, i) => ({ front: `e${i}`, back: `h${i}` }));
	const result = parseLessonJsonImport(JSON.stringify({ decks: [{ title: 'Nagy', cards }] }));
	assert.equal(result.decks.length, 3);
	assert.equal(result.decks[0].title, 'Nagy');
	assert.equal(result.decks[1].title, 'Nagy (2)');
	assert.equal(result.decks[2].cards.length, 50);
});

test('bekezdések szerkesztői szakaszokká alakulnak', () => {
	const result = parseLessonJsonImport(JSON.stringify({ sections: [{ title: 'Cím', body: 'Szia **világ**!' }] }));
	const content = importSectionsToContent(result.sections);
	assert.equal(content.length, 1);
	assert.equal(content[0].title, 'Cím');
	assert.equal(content[0].intro, false);
	assert.ok(content[0].slug.startsWith('bekezdes-'));
	assert.equal(content[0].doc.type, 'doc');
});

test('hibák magyar üzenettel, sorszámmal jönnek', () => {
	assert.throws(() => parseLessonJsonImport('nem json'), /Érvénytelen JSON/);
	assert.throws(() => parseLessonJsonImport('{}'), /Nincs betölthető tartalom/);
	assert.throws(() => parseLessonJsonImport(JSON.stringify({ quiz: [{ type: 'esszé', question: 'Q?' }] })), /1\. kérdés.*ismeretlen típus/);
	assert.throws(() => parseLessonJsonImport(JSON.stringify({ quiz: [{ type: 'choice', question: 'Q?', options: ['csak egy'], answer: 'csak egy' }] })), /1\. kérdés/);
	assert.throws(() => parseLessonJsonImport(JSON.stringify({ quiz: [{ type: 'map', question: 'Q?' }] })), /vaktérkép/);
	assert.throws(() => parseLessonJsonImport(JSON.stringify({ sections: [{ title: '', body: 'x' }] })), /1\. bekezdés/);
	assert.throws(() => parseLessonJsonImport(JSON.stringify({ decks: [{ title: 'C', cards: [] }] })), /nem lehet üres/);
	assert.throws(() => parseLessonJsonImport(JSON.stringify({ decks: [{ title: 'C', cards: [{ front: 'e', back: '' }] }] })), /1\. kártya/);
});

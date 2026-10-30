// Futtatás: node --experimental-strip-types --conditions=browser --test scripts/test-deck-paste.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { isMultiPaste, parsePastedPairs, splitPairLine } from '../src/lib/deck-paste.ts';

const WORDS = [
	['alma', 'apple'],
	['körte', 'pear'],
	['szilva', 'plum'],
	['barack', 'peach'],
	['cseresznye', 'cherry'],
	['eper', 'strawberry'],
	['málna', 'raspberry'],
	['áfonya', 'blueberry'],
	['szőlő', 'grape'],
	['dinnye', 'melon']
];

function buildPaste(n) {
	const lines = [];
	for (let i = 0; i < n; i++) {
		const [hu, en] = WORDS[i % WORDS.length];
		const sep = i % 3 === 0 ? ';' : i % 3 === 1 ? '\t' : '|';
		lines.push(`${hu} ${i + 1}${sep}${en} ${i + 1}`);
	}
	return lines.join('\r\n');
}

test('44 soros beillesztésből mind a 44 pár megérkezik', () => {
	const pairs = parsePastedPairs(buildPaste(44));
	assert.equal(pairs.length, 44);
	assert.equal(pairs[0].front, 'alma 1');
	assert.equal(pairs[0].back, 'apple 1');
	assert.equal(pairs[43].front, `${WORDS[43 % WORDS.length][0]} 44`);
	assert.equal(pairs[43].back, `${WORDS[43 % WORDS.length][1]} 44`);
});

test('Üres sorok és záró elválasztók nem vesznek el kártyát', () => {
	const text = 'alma;apple;\n\nkörte\tpear\n  \nszilva|plum|';
	const pairs = parsePastedPairs(text);
	assert.equal(pairs.length, 3);
	assert.deepEqual(pairs[0], { front: 'alma', back: 'apple' });
	assert.deepEqual(pairs[2], { front: 'szilva', back: 'plum' });
});

test('Elválasztó nélküli többsoros szöveg soronként előlap lesz', () => {
	const pairs = parsePastedPairs('első\nmásodik');
	assert.equal(pairs.length, 2);
	assert.equal(pairs[0].back, '');
});

test('Többsoros beillesztés felismerése elválasztó nélkül is', () => {
	assert.equal(isMultiPaste(buildPaste(44)), true);
	assert.equal(isMultiPaste('egyetlen szó'), false);
	assert.equal(splitPairLine('   '), null);
});

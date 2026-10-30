// Futtatás: node --experimental-strip-types --conditions=browser --test scripts/test-deck-rows.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { pruneEmptyRows } from '../src/lib/deck-rows.ts';

const row = (key, front, back, id = null) => ({ key, id, front, back, sectionSlug: '', orig: null });

test('Közbülső üres sor kikerül, a tartalom sorrendje megmarad', () => {
	const { kept, removedIds, changed } = pruneEmptyRows([
		row(1, 'alma', 'apple', 'a1'),
		row(2, '  ', ''),
		row(3, 'körte', 'pear')
	]);
	assert.equal(changed, true);
	assert.deepEqual(kept.map((r) => r.key), [1, 3]);
	assert.deepEqual(removedIds, []);
});

test('Mentett üres sor azonosítója a törlendők közé kerül', () => {
	const { kept, removedIds } = pruneEmptyRows([
		row(1, 'alma', 'apple', 'a1'),
		row(2, '', '', 'a2'),
		row(3, 'körte', 'pear')
	]);
	assert.deepEqual(kept.map((r) => r.key), [1, 3]);
	assert.deepEqual(removedIds, ['a2']);
});

test('Az utolsó üres sor megmarad a folytatáshoz', () => {
	const { kept, removedIds, changed } = pruneEmptyRows([row(1, 'alma', 'apple', 'a1'), row(2, '', '', 'a2')]);
	assert.deepEqual(kept.map((r) => r.key), [1, 2]);
	assert.deepEqual(removedIds, []);
	assert.equal(changed, false);
});

test('Végi üres futamból csak az utolsó marad meg', () => {
	const { kept, changed } = pruneEmptyRows([row(1, 'alma', 'apple'), row(2, '', ''), row(3, '  ', ' ')]);
	assert.equal(changed, true);
	assert.deepEqual(kept.map((r) => r.key), [1, 3]);
});

test('Egyetlen üres sor megmarad, változás nélkül', () => {
	const { kept, removedIds, changed } = pruneEmptyRows([row(1, '', '')]);
	assert.equal(changed, false);
	assert.equal(kept.length, 1);
	assert.deepEqual(removedIds, []);
});

test('Teli lista változatlanul marad', () => {
	const { kept, changed } = pruneEmptyRows([row(1, 'a', 'b'), row(2, 'c', 'd')]);
	assert.equal(changed, false);
	assert.deepEqual(kept.map((r) => r.key), [1, 2]);
});

test('Félig kitöltött sor megmarad', () => {
	const { kept, changed } = pruneEmptyRows([row(1, 'alma', ''), row(2, '', 'pear')]);
	assert.equal(changed, false);
	assert.equal(kept.length, 2);
});

test('A fókuszt kapó üres sor mentesül a takarítás alól', () => {
	const { kept, removedIds, changed } = pruneEmptyRows(
		[row(1, 'alma', 'apple'), row(2, '', ''), row(3, '', ''), row(4, '', '')],
		2
	);
	assert.equal(changed, true);
	assert.deepEqual(kept.map((r) => r.key), [1, 2, 4]);
	assert.deepEqual(removedIds, []);
});

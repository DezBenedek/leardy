// Futtatás: node --test scripts/test-quiz-review.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { typescriptModuleUrl } from './typescript-module.mjs';

const { canRetryMissed, selectMissedQuestions } = await import(
	await typescriptModuleUrl(new URL('../src/lib/quiz/quiz-review.ts', import.meta.url))
);

test('csak részsiker után ajánl rontott újrakört', () => {
	assert.equal(canRetryMissed(5, 0), false);
	assert.equal(canRetryMissed(5, 5), false);
	assert.equal(canRetryMissed(5, 2), true);
	assert.equal(canRetryMissed(1, 0), false);
	assert.equal(canRetryMissed(0, 0), false);
});

test('rontott kérdések sorrendben maradnak', () => {
	const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
	const missed = new Set(['b', 'c']);
	const result = selectMissedQuestions(list, (q) => missed.has(q.id));
	assert.deepEqual(result.map((q) => q.id), ['b', 'c']);
});

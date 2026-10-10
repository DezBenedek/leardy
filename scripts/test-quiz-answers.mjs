import assert from 'node:assert/strict';
import test from 'node:test';
import { typescriptModuleUrl } from './typescript-module.mjs';

const { correctQuizAnswer, isQuizAnswerCorrect, formatQuizAnswer } = await import(await typescriptModuleUrl(new URL('../src/lib/quiz-answers.ts', import.meta.url)));
const question = { type: 'match', correct_answer: 'régi első válasz', pairs: [{ left: 'Magyarország', right: 'Budapest' }, { left: 'Ausztria', right: 'Bécs' }, { left: 'Franciaország', right: 'Párizs' }] };

test('A párosítás minden párt értékel, a régi helyesválasz-mezőtől függetlenül', () => {
	assert.deepEqual(JSON.parse(correctQuizAnswer(question)), ['Budapest', 'Bécs', 'Párizs']);
	assert.equal(isQuizAnswerCorrect(question, '["Budapest","Bécs","Párizs"]'), true);
	for (const answer of [undefined, 'Budapest', '["Budapest"]', '["Budapest","Párizs","Bécs"]', '["Budapest","Budapest","Párizs"]', '["Budapest","Bécs","Párizs","extra"]', '{}', '[null]', 'hibás JSON']) {
		assert.equal(isQuizAnswerCorrect(question, answer), false, String(answer));
	}
});

test('A visszajelzés minden pár mindkét oldalát megőrzi', () => {
	assert.equal(formatQuizAnswer(question, correctQuizAnswer(question)), 'Magyarország → Budapest; Ausztria → Bécs; Franciaország → Párizs');
	assert.equal(formatQuizAnswer(question, '["Budapest"]'), 'Magyarország → Budapest; Ausztria → nincs válasz; Franciaország → nincs válasz');
});

test('A többi kérdéstípus kiértékelése megmarad', () => {
	assert.equal(isQuizAnswerCorrect({ type: 'text', correct_answer: 'Árvíz' }, ' ÁRVÍZ '), true);
	assert.equal(isQuizAnswerCorrect({ type: 'tf', correct_answer: 'Igaz' }, 'igaz'), true);
	assert.equal(isQuizAnswerCorrect({ type: 'choice', correct_answer: 'Bécs' }, 'Bécs'), true);
	assert.equal(isQuizAnswerCorrect({ type: 'choice', correct_answer: 'Bécs' }, 'Budapest'), false);
	const order = { type: 'order', correct_answer: '["Első","Második"]' };
	assert.equal(isQuizAnswerCorrect(order, '[ "Első", "Második" ]'), true);
	assert.equal(isQuizAnswerCorrect(order, '["Második","Első"]'), false);
	assert.equal(isQuizAnswerCorrect(order, 'hibás'), false);
});

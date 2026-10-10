import assert from 'node:assert/strict';
import test from 'node:test';
import { typescriptModuleUrl } from './typescript-module.mjs';

const { QUESTION_TYPES, loadQuestionOptions, prepareQuestion, questionType, storedQuestionOptions } = await import(await typescriptModuleUrl(new URL('../src/lib/question-types/registry.ts', import.meta.url)));

function question(type, fields = {}) {
	return { id: type, type, question_text: 'Tesztkérdés', options: [], pairs: [], correct_answer: '', ...fields };
}

test('Minden válaszlistás típus kever, és megőrzi az eredeti adatokat', () => {
	for (const type of ['choice', 'order', 'tf']) {
		const source = question(type, { options: type === 'tf' ? ['Igaz', 'Hamis'] : ['Első', 'Második', 'Harmadik'], correct_answer: 'Első' });
		const before = structuredClone(source);
		const prepared = prepareQuestion(source, () => 0);
		assert.notDeepEqual(prepared.options, source.options, type);
		assert.deepEqual([...prepared.options].sort(), [...source.options].sort());
		assert.deepEqual(source, before);
		assert.equal('correct_answer' in prepared, false);
		assert.equal('pairs' in prepared, false);
	}
});

test('A párosítás mindkét oldalt keveri, az eredeti párok és a kiértékelés megmaradnak', () => {
	const source = question('match', { pairs: [{ left: 'Magyarország', right: 'Budapest' }, { left: 'Ausztria', right: 'Bécs' }, { left: 'Franciaország', right: 'Párizs' }] });
	const before = structuredClone(source);
	const prepared = prepareQuestion(source, () => 0);
	assert.deepEqual(prepared.leftOrder, [1, 2, 0]);
	assert.deepEqual(prepared.options, ['Bécs', 'Párizs', 'Budapest']);
	assert.deepEqual(prepared.lefts, before.pairs.map((pair) => pair.left));
	const answers = [];
	for (const index of prepared.leftOrder) answers[index] = source.pairs[index].right;
	assert.equal(questionType('match').isCorrect(source, JSON.stringify(answers)), true);
	assert.equal(questionType('match').isCorrect(source, JSON.stringify(prepared.options)), false);
	assert.deepEqual(source, before);
	assert.equal('pairs' in prepared, false);
});

test('A két oldal keverése egymástól független véletlenszámokat használ', () => {
	const source = question('match', { pairs: [{ left: 'Első', right: 'Egy' }, { left: 'Második', right: 'Kettő' }, { left: 'Harmadik', right: 'Három' }] });
	const numbers = [0, 0, .99, .99];
	const prepared = prepareQuestion(source, () => numbers.shift());
	assert.deepEqual(prepared.leftOrder, [1, 2, 0]);
	assert.deepEqual(prepared.options, ['Egy', 'Kettő', 'Három']);
});

test('Minden típus saját definícióval tölti be és ellenőrzi a válaszait', () => {
	const fixtures = {
		choice: { options: ['Egy', 'Kettő'], pairs: [], correct_answer: 'Egy' },
		tf: { options: [], pairs: [], correct_answer: 'Igaz' },
		text: { options: [], pairs: [], correct_answer: 'Árvíz' },
		match: { options: [], pairs: [{ left: 'Első', right: 'Egy' }, { left: 'Második', right: 'Kettő' }], correct_answer: '' },
		gap: { options: [], pairs: [], correct_answer: '', settings: { mode: 'drag', text: 'Főváros: [[Budapest]].' } },
		map: { options: [], pairs: [], correct_answer: '', imageUrl: 'https://example.com/map.png', settings: { mode: 'text', boxes: [{ id: 'egy', x: 50, y: 50, width: 30, answer: 'Budapest' }] } },
		order: { options: ['Első', 'Második'], pairs: [], correct_answer: '' }
	};
	for (const definition of QUESTION_TYPES) {
		const fields = fixtures[definition.id];
		assert.equal(definition.validate(fields), null);
		const loaded = loadQuestionOptions(definition.id, JSON.stringify(storedQuestionOptions(definition.id, fields)));
		const loadedQuestion = question(definition.id, { ...loaded, correct_answer: definition.correctAnswer(fields) });
		assert.equal(definition.isCorrect(loadedQuestion, definition.solution(loadedQuestion)), true, definition.id);
		assert.equal(definition.isCorrect(loadedQuestion, 'Hibás válasz'), false, definition.id);
		assert.equal(definition.validate(definition.create()) === null, definition.id === 'tf');
	}
});

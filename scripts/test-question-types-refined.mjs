import assert from 'node:assert/strict';
import test from 'node:test';
import { typescriptModuleUrl } from './typescript-module.mjs';
const { blankQuestion, draftOptionsJson, draftToPreview, validateQuestion, seedToDraft } = await import(await typescriptModuleUrl(new URL('../src/lib/quiz-editor.ts', import.meta.url)));
const { loadQuestionOptions, prepareQuestion, questionType, QUESTION_TYPES } = await import(await typescriptModuleUrl(new URL('../src/lib/question-types/registry.ts', import.meta.url)));
const { readSettings } = await import(await typescriptModuleUrl(new URL('../src/lib/question-types/settings.ts', import.meta.url)));
const { boxArrowEnd } = await import(await typescriptModuleUrl(new URL('../src/lib/question-types/map/geometry.ts', import.meta.url)));
const { contrastColor, arrowContrast } = await import(await typescriptModuleUrl(new URL('../src/lib/question-types/map/contrast.ts', import.meta.url)));
function draft(type, extra = {}) { return { ...blankQuestion('teszt', type), question_text: 'Tesztkérdés', ...extra }; }
const boxes = [{ id: 'egy', x: 30, y: 20, width: 25, answer: 'Budapest', arrow: { x: 70, y: 80 } }, { id: 'ketto', x: 70, y: 30, width: 25, answer: 'Bécs' }];

test('A típuslista sorrendje és nevei az új szerkesztést követik', () => {
	assert.deepEqual(QUESTION_TYPES.map((type) => type.id), ['choice', 'tf', 'text', 'gap', 'match', 'order', 'map']);
	assert.deepEqual(QUESTION_TYPES.map((type) => type.title), ['Feleletválasztós', 'Igaz, hamis', 'Rövid válasz (beírós)', 'Hiányos szöveg', 'Összekötős', 'Sorrend', 'Vaktérkép']);
});

test('Több helyes válasznál a teljes halmazt kell megadni, a sorrend közömbös', () => {
	const source = draft('choice', { options: ['Egy', 'Kettő', 'Három'], correct_answer: '["Egy","Három"]', settings: { multiple: true } });
	assert.equal(validateQuestion(source), null);
	const question = draftToPreview(source);
	assert.equal(prepareQuestion(question).multiple, true);
	assert.equal(questionType('choice').isCorrect(question, '["Három","Egy"]'), true);
	for (const answer of ['Egy', '["Egy"]', '["Egy","Egy"]', '["Egy","Három","Kettő"]']) assert.equal(questionType('choice').isCorrect(question, answer), false);
	assert.equal(questionType('choice').formatAnswer(question, question.correct_answer), 'Egy, Három');
	assert.equal(validateQuestion({ ...source, correct_answer: '[]' }), 'Jelöld meg a helyes választ.');
	assert.notEqual(validateQuestion({ ...source, correct_answer: '["Négy"]' }), null);
	const legacy = draftToPreview(draft('choice', { options: ['Egy', 'Kettő'], correct_answer: 'Egy' }));
	assert.equal(questionType('choice').isCorrect(legacy, 'Egy'), true);
});

test('A hiányos szöveg minden módja megmarad mentéskor és nem fedi fel a beírós választ', () => {
	for (const mode of ['text', 'drag', 'dropdown']) for (const reusable of [true, false]) {
		const source = draft('gap', { options: ['Szeged'], settings: { mode, reusable, text: '[[Budapest]] és [[Bécs]], újra [[Budapest]].' } });
		assert.equal(validateQuestion(source), null);
		const loaded = loadQuestionOptions('gap', draftOptionsJson(source));
		assert.deepEqual(loaded.settings, source.settings);
		const preview = draftToPreview(source);
		const prepared = prepareQuestion(preview, () => 0);
		assert.equal(prepared.gapText, '[[]] és [[]], újra [[]].');
		assert.equal('settings' in prepared, false);
		assert.equal('correct_answer' in prepared, false);
		assert.equal(questionType('gap').isCorrect(preview, '[" Budapest ","BÉCS","Budapest"]'), true);
		assert.equal(questionType('gap').isCorrect(preview, '["Budapest","Bécs"]'), false);
		assert.equal(questionType('gap').isCorrect(preview, '["Bécs","Budapest","Budapest"]'), false);
		if (mode === 'text') assert.deepEqual(prepared.options, []);
		else assert.equal(prepared.options.filter((item) => item === 'Budapest').length, reusable || mode === 'dropdown' ? 1 : 2);
	}
});

test('A vaktérkép mezői, nyilai és módjai megmaradnak, a beírós játékban nincs megoldás', () => {
	for (const mode of ['text', 'drag', 'dropdown']) {
		const source = draft('map', { imageUrl: 'https://example.com/map.png', settings: { mode, reusable: true, boxes: structuredClone(boxes) } });
		assert.equal(validateQuestion(source), null);
		const preview = draftToPreview(source);
		assert.deepEqual(preview.settings, source.settings);
		const prepared = prepareQuestion(preview, () => 0);
		assert.equal(prepared.boxes[0].answer, undefined);
		assert.deepEqual(prepared.boxes[0].arrow, boxes[0].arrow);
		assert.equal(prepared.imageUrl, source.imageUrl);
		if (mode === 'text') assert.equal(JSON.stringify(prepared).includes('Budapest'), false);
		assert.equal(questionType('map').isCorrect(preview, '["Budapest","Bécs"]'), true);
		assert.equal(questionType('map').isCorrect(preview, '["Bécs","Budapest"]'), false);
		const templateDraft = seedToDraft({ ...source, title: 'Sablon', subtitle: '' }, 'másik');
		templateDraft.settings.boxes[0].answer = 'Módosított';
		assert.equal(source.settings.boxes[0].answer, 'Budapest');
	}
	assert.notEqual(validateQuestion(draft('map', { settings: { mode: 'text', boxes } })), null);
	assert.notEqual(validateQuestion(draft('map', { imageUrl: 'https://example.com/map.png', settings: { mode: 'text', boxes: [{ ...boxes[0], answer: '' }] } })), null);
});

test('A sérült beállításokat a közös olvasó visszautasítja', () => {
	for (const raw of [null, [], { mode: 'hibás' }, { multiple: 'true' }, { boxes: [{ ...boxes[0], x: NaN }] }, { boxes: [{ ...boxes[0], x: 101 }] }, { boxes: [{ ...boxes[0], width: 0 }] }, { boxes: [{ ...boxes[0], arrow: { x: 20, y: Infinity } }] }]) assert.throws(() => readSettings(raw));
	assert.notEqual(validateQuestion(draft('gap', { settings: { mode: 'text', text: '[[Budapest] és Bécs.' } })), null);
});

test('A nyíl minden irányból a mező széléhez igazodik, átméretezéskor is', () => {
	for (const width of [320, 550, 900]) {
		const height = width * .7;
		for (const arrow of [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 90, y: 90 }]) {
			const box = { x: 50, y: 50, width: 30, arrow };
			const end = boxArrowEnd(box, width, height);
			const dx = Math.abs(end.x - width / 2);
			const dy = Math.abs(end.y - height / 2);
			assert.ok(dx <= width * .15 + 1e-6 && dy <= 22 + 1e-6);
			assert.ok(Math.abs(dx - width * .15) < 1e-6 || Math.abs(dy - 22) < 1e-6);
		}
	}
});

test('A nyíl a mögötte lévő képrésztől függően fekete vagy fehér, mozgatás után is', () => {
	const pixels = { width: 4, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 30, 30, 30, 255, 230, 230, 230, 255, 255, 255, 255, 255]) };
	assert.equal(contrastColor(pixels, 0, 0), '#fff');
	assert.equal(contrastColor(pixels, 1, 0), '#000');
	const forward = arrowContrast(pixels, { x: 0, y: 0 }, { x: 100, y: 0 }, 100, 100);
	assert.equal(forward[0].color, '#fff');
	assert.equal(forward.at(-1).color, '#000');
	const backward = arrowContrast(pixels, { x: 100, y: 0 }, { x: 0, y: 0 }, 100, 100);
	assert.equal(backward[0].color, '#000');
	assert.equal(backward.at(-1).color, '#fff');
	assert.equal(contrastColor({ width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 0]) }, 0, 0), '#000');
});

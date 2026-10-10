import assert from 'node:assert/strict';
import test from 'node:test';
import { typescriptModuleUrl } from './typescript-module.mjs';

const { QUESTION_TYPES, blankQuestion, seedToDraft, draftToPreview, draftOptionsJson, draftCorrectAnswer, parseOptionsJson, loadLegacyCustomTemplates, loadCustomTemplates, saveCustomTemplate, deleteCustomTemplate, importLegacyCustomTemplates, validateQuestion } = await import(await typescriptModuleUrl(new URL('../src/lib/quiz-editor.ts', import.meta.url)));

const templateFixtures = QUESTION_TYPES.map(({ id: type }) => ({
	...blankQuestion('teszt', type), type, title: 'Saját tesztsablon', subtitle: '', question_text: 'Tesztkérdés',
	options: type === 'choice' || type === 'order' ? ['Első', 'Második'] : [],
	pairs: type === 'match' ? [{ left: 'Első fogalom', right: 'Első pár' }, { left: 'Második fogalom', right: 'Második pár' }] : [],
	correct_answer: type === 'choice' ? 'Első' : type === 'tf' ? 'Igaz' : type === 'text' ? 'Válasz' : ''
}));

test('Minden sablon menthető alakja és tanulói előnézete ugyanazokat a válaszokat tartalmazza', () => {
	for (const seed of templateFixtures) {
		const draft = seedToDraft(seed, 'kvíz');
		const preview = draftToPreview(draft);
		const stored = parseOptionsJson(draftOptionsJson(draft));
		assert.equal(preview.question_text, seed.question_text);
		assert.equal(preview.type, seed.type);
		assert.equal(preview.correct_answer, draftCorrectAnswer(draft));
		assert.deepEqual(preview.pairs, stored.pairs);
		assert.deepEqual(preview.options, seed.type === 'match' ? stored.pairs.map(p => p.right) : stored.options);
		if (seed.type === 'order') assert.deepEqual(JSON.parse(preview.correct_answer), stored.options);
		if (seed.type === 'match') assert.deepEqual(JSON.parse(preview.correct_answer), stored.pairs.map(pair => pair.right));
		// A sablonból létrehozott kérdés szerkesztése nem módosítja a sablont.
		draft.options.push('Új válasz');
		if (draft.pairs.length) draft.pairs[0].left = 'Átírt fogalom';
		assert.ok(!seed.options.includes('Új válasz'));
		assert.ok(seed.pairs.every(pair => pair.left !== 'Átírt fogalom'));
	}
});

test('A sérült és ismételt helyi sablonok nem törik el a sablonválasztót', () => {
	const valid = { ...templateFixtures[0], key: 'sablon', createdAt: 1 };
	globalThis.localStorage = { getItem: () => JSON.stringify([null, {}, { key: 'hibás', type: 'choice' }, valid, valid, { ...valid, key: 'hibás-pár', pairs: [null] }]) };
	try { assert.deepEqual(loadLegacyCustomTemplates(), [valid]); }
	finally { delete globalThis.localStorage; }
});

test('A sablonok lekérése, mentése és törlése a fiók API-ját használja, helyi tár nélkül', async () => {
	const originalFetch = globalThis.fetch;
	const calls = [];
	const saved = { ...templateFixtures[0], key: 'mentett', createdAt: 1 };
	globalThis.fetch = async (url, options) => { calls.push({ url, ...options }); return Response.json({ templates: [saved] }); };
	globalThis.localStorage = { getItem: () => { throw new Error('Nem olvasható a helyi tár'); }, setItem: () => { throw new Error('Nem írható a helyi tár'); } };
	try {
		assert.deepEqual(await loadCustomTemplates(), [saved]);
		assert.deepEqual(await saveCustomTemplate(templateFixtures[0]), [saved]);
		assert.deepEqual(await deleteCustomTemplate(saved.key), [saved]);
		assert.deepEqual(calls.map(call => call.method), ['GET', 'POST', 'DELETE']);
		assert.ok(calls.every(call => call.url === '/api/quiz-templates' && call.cache === 'no-store' && call.credentials === 'same-origin'));
		assert.deepEqual(JSON.parse(calls[1].body).templates, [templateFixtures[0]]);
		assert.deepEqual(JSON.parse(calls[2].body), { key: saved.key });
	} finally { globalThis.fetch = originalFetch; delete globalThis.localStorage; }
});

test('Sikertelen szervermentésnél nincs hamis siker, és a régi sablonok megmaradnak', async () => {
	const originalFetch = globalThis.fetch;
	let removed = false;
	globalThis.localStorage = { removeItem: () => { removed = true; } };
	globalThis.fetch = async () => Response.json({ message: 'Jelentkezz be.' }, { status: 401 });
	try {
		await assert.rejects(saveCustomTemplate(templateFixtures[0]), /Jelentkezz be/);
		await assert.rejects(importLegacyCustomTemplates([{ ...templateFixtures[0], key: 'régi', createdAt: 1 }]), /Jelentkezz be/);
		assert.equal(removed, false);
		globalThis.fetch = async () => Response.json({ templates: [] });
		await importLegacyCustomTemplates([{ ...templateFixtures[0], key: 'régi', createdAt: 1 }]);
		assert.equal(removed, true);
		globalThis.fetch = async () => { throw new TypeError('Nincs kapcsolat'); };
		await assert.rejects(saveCustomTemplate(templateFixtures[0]), /Nincs kapcsolat/);
	} finally { globalThis.fetch = originalFetch; delete globalThis.localStorage; }
});

test('Minden kérdéstípus képe megmarad mentéskor, előnézetben és saját sablonban', () => {
	for (const seed of templateFixtures) {
		const draft = seedToDraft({ ...seed, imageUrl: 'https://example.com/kép.png' }, 'kvíz');
		const stored = parseOptionsJson(draftOptionsJson(draft));
		const preview = draftToPreview(draft);
		assert.equal(stored.imageUrl, 'https://example.com/k%C3%A9p.png');
		assert.equal(preview.imageUrl, stored.imageUrl);
		assert.equal(validateQuestion(draft), null);
		const withoutImage = { ...draft, imageUrl: '' };
		assert.equal('imageUrl' in JSON.parse(draftOptionsJson(withoutImage)), false);
	}
});

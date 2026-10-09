import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const transpile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/^import .*\n/gm, '').replaceAll('export ', '');
const protocol = transpile(await readFile(new URL('../src/lib/content-protocol.ts', import.meta.url), 'utf8'));
const source = transpile(await readFile(new URL('../src/lib/offline-content.ts', import.meta.url), 'utf8'));
function catalog(storage = new Map()) {
	return vm.runInNewContext(protocol + '\n' + source + '\n({buildOfflineCatalog, readOfflineCatalog})', {
		URL, caches: { async keys() { return [...storage.keys()]; }, async open(name) { return {
			async keys() { return [...storage.get(name).keys()].map((url) => ({ url: `https://example.invalid${url}` })); },
			async match(key) { return storage.get(name).get(new URL(key.url).pathname + new URL(key.url).search)?.clone(); }
		}; } }
	});
}
const document = (id, subject = 'subject', level = 'level') => ({ lessonPage: {
	lesson: { id, title: `Lecke: ${id}`, body_md: '# Szöveg' },
	subject: { id: subject, title: subject }, level: { id: level, title: level },
	material: { id: `material:${level}`, title: 'Témakör' }, quizzes: []
}, quizVersion: 'v1', contentVersion: 1 });
const tree = (done = false) => ({ id: 'subject', title: 'Tantárgy', icon: 'landmark', sort: 2, levelLabel: 'Tananyag', levels: [
	{ id: 'level', title: 'Tananyag', sort: 1, materials: [
		{ id: 'material:level', title: 'Témakör', sort: 1, lessons: [{ id: 'saved', title: 'Mentett', sort: 1, done }, { id: 'unopened', title: 'Nem megnyitott', sort: 2, done }] }
	] }, { id: 'empty', title: 'Üres', sort: 0, materials: [] }
] });
const json = (value) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

test('A választók csak ténylegesen mentett leckét tartalmazó ágakat kapnak', () => {
	const result = catalog().buildOfflineCatalog([document('saved')], [], [tree(true)]);
	assert.equal(result.subjects.length, 1);
	assert.equal(result.subjects[0].levelCount, 1);
	assert.equal(result.subjects[0].lessonCount, 1);
	assert.equal(result.subjects[0].icon, 'landmark');
	const lessons = result.trees.subject.levels[0].materials[0].lessons;
	assert.equal(lessons.length, 1);
	assert.equal(lessons[0].id, 'saved');
	assert.equal(lessons[0].done, true);
	assert.equal(lessons[0].body_md, undefined);
});

test('A katalógus vagy fa törlése után is visszaáll a hierarchia a mentett leckékből', () => {
	const result = catalog().buildOfflineCatalog([document('first'), document('second', 'other', 'other-level')]);
	assert.equal(result.subjects.length, 2);
	assert.equal(result.trees.other.levels[0].id, 'other-level');
	assert.equal(result.trees.other.levels[0].materials[0].lessons[0].id, 'second');
	assert.equal(catalog().buildOfflineCatalog([]).subjects.length, 0);
});

test('Másik fiók teljesítési állapota és sérült cache-bejegyzés nem kerül az offline listába', async () => {
	const storage = new Map([
		['leardy-content-v2', new Map([
			['/api/lessons/saved', json(document('saved'))],
			['/api/lessons/broken', new Response('invalid json')],
			['/api/browse?subject=subject', json({ tree: tree() })]
		])],
		['leardy-private-v2:owner', new Map([['/api/browse?subject=subject', json({ tree: tree(true) })]])]
	]);
	const { readOfflineCatalog } = catalog(storage);
	const owner = await readOfflineCatalog('owner');
	const other = await readOfflineCatalog('other');
	assert.equal(owner.lessons.length, 1);
	assert.equal(owner.trees.subject.levels[0].materials[0].lessons[0].done, true);
	assert.equal(other.trees.subject.levels[0].materials[0].lessons[0].done, false);
	storage.get('leardy-content-v2').delete('/api/lessons/saved');
	assert.equal((await readOfflineCatalog('owner')).subjects.length, 0);
});

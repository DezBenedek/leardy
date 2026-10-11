import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const origin = 'https://example.invalid';
const sources = await Promise.all(['content-protocol', 'content-storage', 'offline-library', 'content-client', 'mutation-fetch'].map(async (name) => {
	const source = await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8');
	return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/^import .*\n/gm, '').replaceAll('export ', '');
}));
const json = (data, owner = 'public') => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'x-content-owner': owner } });
const pkg = { quizId: 'pack:saved', title: 'Mentett kártyák', attachedLessonId: 'lesson', questions: [{ id: 'card', question_text: 'Kérdés', correct_answer: 'Válasz' }] };

function harness(network) {
	const storage = new Map(), values = new Map([['leardy-offline-user-v1', JSON.stringify({ id: 'owner', name: 'Tanuló' })]]);
	const navigator = { onLine: true, serviceWorker: { controller: null } };
	const caches = { async open(name) {
		if (!storage.has(name)) storage.set(name, new Map());
		const entries = storage.get(name);
		return {
			async match(key) { return entries.get(typeof key === 'string' ? key : key.url)?.clone(); },
			async put(key, response) { entries.set(typeof key === 'string' ? key : key.url, response.clone()); },
			async delete(key) { return entries.delete(typeof key === 'string' ? key : key.url); },
			async keys() { return [...entries.keys()].map((url) => new Request(url)); }
		};
	}, async keys() { return [...storage.keys()]; } };
	const window = new EventTarget(), messages = [], invalidations = [];
	window.addEventListener('leardy-content', (event) => messages.push(event.detail));
	const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
	const context = vm.createContext({ browser: true, location: { origin }, navigator, window, caches, localStorage,
		fetch: (url, options) => network(new URL(url, origin), options), invalidate: (key) => invalidations.push(key),
		Request, Response, Headers, URL, CustomEvent, structuredClone, console });
	const client = vm.runInContext(sources.join('\n') + '\n({ contentFetch, mutationFetch, rememberIdentity })', context);
	return { ...client, navigator, values, messages, caches, invalidations };
}

test('Worker nélkül megnyitott tananyag és lecke később offline is visszatöltődik', async () => {
	let online = true, calls = 0;
	const h = harness(async (url) => {
		calls++;
		if (!online) throw new TypeError('Nincs hálózat.');
		return json({ path: url.pathname });
	});
	for (const path of ['/api/browse', '/api/browse?subject=subject', '/api/lessons/lesson']) assert.equal((await h.contentFetch(path)).ok, true);
	online = false; h.navigator.onLine = false;
	for (const path of ['/api/browse', '/api/browse?subject=subject', '/api/lessons/lesson']) {
		const response = await h.contentFetch(path);
		assert.equal(response.headers.get('x-content-offline'), 'true');
		assert.equal((await response.json()).path, new URL(path, origin).pathname);
	}
	assert.equal(calls, 3);
});

test('A gyorsítótár olvasása online nem kapcsolja offline módba a listát', async () => {
	const h = harness(async () => json({ subjects: [] }));
	await h.contentFetch('/api/browse');
	assert.equal((await h.contentFetch('/api/browse', true)).headers.get('x-content-offline'), 'false');
	assert.equal(h.messages.at(-1).offline, false);
});

test('Észrevétlen hálózathiba és 503 visszaadja a mentett leckét, a 404 törli', async () => {
	let mode = 200;
	const h = harness(async () => {
		if (mode === 0) throw new TypeError('Nincs hálózat.');
		return mode === 200 ? json({ lessonPage: {} }) : new Response(null, { status: mode });
	});
	await h.contentFetch('/api/lessons/lesson');
	for (mode of [0, 503]) assert.equal((await h.contentFetch('/api/lessons/lesson')).headers.get('x-content-offline'), 'true');
	mode = 404;
	assert.equal((await h.contentFetch('/api/lessons/lesson')).status, 404);
	mode = 503;
	assert.equal((await h.contentFetch('/api/lessons/lesson')).status, 503);
});

test('A régi könyvtár, a még meg nem nyitott csomag és a kapcsolt kártyák offline elérhetők', async () => {
	const h = harness(async () => { throw new TypeError('Nincs hálózat.'); });
	h.values.set('leardy-library:owner', JSON.stringify({ at: 1, packages: [pkg] }));
	h.navigator.onLine = false;
	assert.deepEqual((await (await h.contentFetch('/api/library')).json()).packages, [pkg]);
	assert.deepEqual((await (await h.contentFetch('/api/library?ids=1')).json()).ids, [pkg.quizId]);
	assert.deepEqual((await (await h.contentFetch('/api/packages?id=pack%3Asaved')).json()).package.questions, pkg.questions);
	assert.deepEqual((await (await h.contentFetch('/api/packages?attachedTo=lesson')).json()).packages, [pkg]);
});

test('Könyvtárba mentés után külön könyvtárlátogatás nélkül is elkészül az offline példány', async () => {
	let saved = false;
	const h = harness(async (url, options) => {
		if (options?.method === 'POST') { saved = true; return json({ ok: true }); }
		assert.equal(url.pathname, '/api/library');
		return json({ packages: saved ? [pkg] : [] }, 'owner');
	});
	await h.mutationFetch('/api/library', { method: 'POST', body: JSON.stringify({ quizId: pkg.quizId }) });
	h.navigator.onLine = false;
	assert.deepEqual((await (await h.contentFetch('/api/packages?id=pack%3Asaved')).json()).package, pkg);
	assert.ok(h.invalidations.includes('library'));
});

test('Másik fiók könyvtára, csomagja és személyes fája nem kerül a válaszba', async () => {
	let online = true;
	const h = harness(async () => online ? json({ tree: { done: true } }, 'owner') : new Response(null, { status: 503 }));
	h.values.set('leardy-library:owner', JSON.stringify({ packages: [pkg] }));
	await h.contentFetch('/api/browse?subject=subject');
	h.rememberIdentity({ id: 'other', name: 'Másik tanuló' });
	h.navigator.onLine = false;
	online = false;
	for (const path of ['/api/library', '/api/packages?id=pack%3Asaved', '/api/browse?subject=subject']) {
		assert.equal((await h.contentFetch(path)).status, 503);
	}
	assert.equal(await (await h.caches.open('leardy-private-v2:other')).match(`${origin}/api/browse?subject=subject`), undefined);
});

test('A könyvtár friss tartalma és több leckéhez csatolása a régi cache mellett is megmarad', async () => {
	const h = harness(async (url) => json(url.searchParams.has('id') ? { package: { ...pkg, title: 'Régi cím' }, progress: { card: { known: 2 } } } : { packages: [] }, 'owner'));
	await h.contentFetch('/api/packages?id=pack%3Asaved');
	await h.contentFetch('/api/packages?attachedTo=second');
	h.values.set('leardy-library:owner', JSON.stringify({ packages: [{ ...pkg, attachedLessonIds: ['lesson', 'second'] }] }));
	h.navigator.onLine = false;
	const detail = await (await h.contentFetch('/api/packages?id=pack%3Asaved')).json();
	assert.equal(detail.package.title, pkg.title);
	assert.equal(detail.progress.card.known, 2);
	assert.equal((await (await h.contentFetch('/api/packages?attachedTo=second')).json()).packages[0].quizId, pkg.quizId);
});

test('Fiókváltás közben beérkező személyes válasz nem használható és nem mentődik', async () => {
	let release;
	const h = harness(async () => new Promise((resolve) => { release = () => resolve(json({ packages: [pkg] }, 'owner')); }));
	const pending = h.contentFetch('/api/library');
	h.rememberIdentity({ id: 'other', name: 'Másik tanuló' });
	release();
	await assert.rejects(pending, /fiók megváltozott/);
	assert.equal(h.values.has('leardy-library:other'), false);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const transpile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/^import .*\n/gm, '').replaceAll('export ', '');
const apiSource = transpile(await readFile(new URL('../src/lib/offline-api.ts', import.meta.url), 'utf8'));
const sessionSource = transpile(await readFile(new URL('../src/lib/session-client.ts', import.meta.url), 'utf8'));
const authSource = transpile(await readFile(new URL('../src/lib/auth.svelte.ts', import.meta.url), 'utf8'));
const user = { id: 'owner', name: 'Tanuló', email: 'tanulo@example.invalid', role: 'teacher', isEditor: true };
const json = (data, owner = 'owner', status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'x-content-owner': owner } });

function harness(network = async () => json({ room: 'Mentett tanterem' })) {
	let identity = { ...user }, clears = 0;
	const storage = new Map();
	const navigator = { onLine: true };
	const cache = {
		async match(key) { return storage.get(typeof key === 'string' ? key : key.url)?.clone(); },
		async put(key, response) { storage.set(key, response.clone()); },
		async delete(key) { return storage.delete(typeof key === 'string' ? key : key.url); },
		async keys() { return [...storage.keys()].map((url) => new Request(url)); }
	};
	const stores = new Map();
	const caches = { async open(name) { if (!stores.has(name)) stores.set(name, name.endsWith(':owner') ? cache : { ...cache, match: async () => undefined }); return stores.get(name); } };
	const client = vm.runInNewContext(apiSource + '\n' + sessionSource + '\n' + authSource + '\n({ privateFetch, loadSession, auth })', {
		browser: true, navigator, location: { origin: 'https://example.invalid' }, caches,
		PRIVATE_APP_CACHE_PREFIX: 'leardy-offline-api-v1:',
		offlineIdentity: () => identity, rememberIdentity: (value) => { identity = value; },
		clearPersistedCache: () => { clears++; }, untrack: (fn) => fn(), $state: (value) => value,
		localStorage: { removeItem() {} }, fetch: network, Request, Response, Headers, URL, console
	});
	return { ...client, navigator, caches, identity: () => identity, setIdentity: (value) => { identity = value; }, clears: () => clears };
}

test('Az offline munkamenet megőrzi a nevet, a szerepet és a szerkesztői állapotot kérés nélkül', async () => {
	const h = harness();
	const session = await h.loadSession(() => { throw new Error('Nem indulhat kérés.'); }, false);
	assert.equal(session.user.id, user.id);
	assert.equal(session.user.role, 'teacher');
	assert.equal(session.isEditor, true);
	assert.equal(session.offline, true);
	h.auth.seed(session.user, session);
	assert.equal(h.auth.user.email, user.email);
	assert.equal(h.clears(), 0);
	assert.equal(h.identity().id, user.id);
});

test('Hálózathiba, túlterhelés és hibás szerverválasz nem jelent kijelentkezést', async () => {
	const h = harness();
	for (const fetcher of [async () => { throw new TypeError('Nincs hálózat.'); }, async () => json({}, 'owner', 503), async () => json({}, 'owner', 429), async () => new Response('hibás JSON')]) {
		const session = await h.loadSession(fetcher);
		assert.equal(session.user.id, user.id);
		assert.equal(session.offline, true);
	}
	for (const status of [401, 403]) {
		const session = await h.loadSession(async () => json({}, 'owner', status));
		assert.equal(session.user, null);
		assert.equal(session.offline, false);
	}
});

test('Kifejezett kijelentkezést a régi offline layout-adat nem vonhat vissza', async () => {
	const h = harness(async () => json({ ok: true }));
	h.auth.seed(user, { isEditor: true });
	assert.equal(h.identity().isEditor, true);
	await h.auth.logout();
	h.auth.seed(user, { offline: true });
	assert.equal(h.auth.user, null);
	assert.equal(h.identity(), null);
	assert.equal(h.clears(), 1);
});

test('A tanterem teljes válasza új klienspéldány és hosszú offline idő után is olvasható', async () => {
	let calls = 0;
	const h = harness(async () => { calls++; return json({ room: { name: 'Mentett tanterem' }, tasks: [{ id: 'task' }] }); });
	await h.privateFetch('/api/classrooms/room/page');
	h.navigator.onLine = false;
	const response = await h.privateFetch('/api/classrooms/room/page');
	assert.equal(response.headers.get('x-content-offline'), 'true');
	assert.equal((await response.json()).room.name, 'Mentett tanterem');
	assert.equal(calls, 1);
});

test('Hálózathiba és 503 esetén a mentett tanterem megmarad, 403 után törlődik', async () => {
	let mode = 200;
	const h = harness(async () => {
		if (mode === 0) throw new TypeError('Nincs hálózat.');
		return json({ room: 'Tanterem' }, 'owner', mode);
	});
	await h.privateFetch('/api/classrooms/room/page');
	for (mode of [503, 0]) assert.equal((await h.privateFetch('/api/classrooms/room/page')).headers.get('x-content-offline'), 'true');
	mode = 403;
	assert.equal((await h.privateFetch('/api/classrooms/room/page')).status, 403);
	h.navigator.onLine = false;
	assert.equal((await h.privateFetch('/api/classrooms/room/page')).status, 503);
});

test('Másik fiók tanterme és késve érkező válasza nem jelenhet meg', async () => {
	let release, delay = false;
	const h = harness(async () => delay ? new Promise((resolve) => { release = () => resolve(json({ room: 'Másik tanterem' })); }) : json({ room: 'Tanterem' }));
	await h.privateFetch('/api/classrooms/room/page');
	h.setIdentity({ id: 'other', name: 'Másik tanuló' });
	h.navigator.onLine = false;
	assert.equal((await h.privateFetch('/api/classrooms/room/page')).status, 503);
	h.setIdentity(user); h.navigator.onLine = true; delay = true;
	const pending = h.privateFetch('/api/classrooms/other/page');
	await new Promise(setImmediate);
	h.setIdentity({ id: 'other', name: 'Másik tanuló' });
	release();
	await assert.rejects(pending, /fiók megváltozott/);
});

test('Eltérő szerveroldali tulajdonos adata nem mentődik az aktuális fiók alá', async () => {
	const h = harness(async () => json({ room: 'Másik tanterem' }, 'other'));
	await h.privateFetch('/api/classrooms/room/page');
	h.navigator.onLine = false;
	assert.equal((await h.privateFetch('/api/classrooms/room/page')).status, 503);
});

test('Letiltott tárhely mellett az online tanterem továbbra is betöltődik', async () => {
	const h = harness();
	h.caches.open = async () => { throw new Error('Letiltott tárhely.'); };
	assert.equal((await h.privateFetch('/api/classrooms/room/page')).ok, true);
});

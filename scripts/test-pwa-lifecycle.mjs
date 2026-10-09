import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const origin = 'https://example.invalid';
const currentCache = 'leardy-static-current';
const transpile = (source) => ts.transpileModule(source, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;
const protocol = transpile(await readFile(new URL('../src/lib/content-protocol.ts', import.meta.url), 'utf8')).replaceAll('export ', '');
const worker = transpile((await readFile(new URL('../src/service-worker.ts', import.meta.url), 'utf8')).replace(/^import .*\n/m, ''));

function harness(network = async () => new Response('network')) {
	const handlers = new Map();
	const storage = new Map();
	const caches = {
		async open(name) {
			if (!storage.has(name)) {
				const entries = new Map();
				const key = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
				storage.set(name, {
					async put(request, response) { entries.set(key(request), response.clone()); },
					async match(request) { return entries.get(key(request))?.clone(); }
				});
			}
			return storage.get(name);
		},
		async keys() { return [...storage.keys()]; },
		async delete(name) { return storage.delete(name); }
	};
	const self = {
		__WB_MANIFEST: [], location: { origin }, navigator: { onLine: true },
		addEventListener(type, handler) { handlers.set(type, handler); },
		clients: { async claim() {}, async matchAll() { return []; } }
	};
	vm.runInNewContext(protocol + '\n' + worker, {
		self, caches, fetch: network, __APP_BUILD_TIME__: 'current',
		Request, Response, Headers, URL, URLSearchParams, console
	});
	return {
		caches,
		async activate() {
			let pending;
			handlers.get('activate')({ waitUntil(promise) { pending = promise; } });
			await pending;
		},
		async fetch(path, navigate = false) {
			let response;
			const request = new Request(new URL(path, origin));
			if (navigate) Object.defineProperty(request, 'mode', { value: 'navigate' });
			handlers.get('fetch')({ request, respondWith(promise) { response = promise; } });
			return response;
		}
	};
}

test('Frissítés után a nyitott PWA előző kódrészlete még offline is elérhető', async () => {
	const h = harness(async () => { throw new TypeError('Nincs hálózat.'); });
	await h.caches.open('leardy-static-oldest');
	const previous = await h.caches.open('leardy-static-previous');
	await previous.put('/_app/immutable/chunks/lesson.previous.js', new Response('previous code'));
	await h.caches.open(currentCache);
	await h.caches.open('leardy-api-v1');
	await h.caches.open('leardy-content-v2');
	await h.caches.open('leardy-private-v2:user');
	await h.caches.open('other-app');
	await h.activate();
	assert.deepEqual(await h.caches.keys(), ['leardy-static-previous', currentCache, 'leardy-content-v2', 'leardy-private-v2:user', 'other-app']);
	assert.equal(await (await h.fetch('/_app/immutable/chunks/lesson.previous.js')).text(), 'previous code');
});

test('Az új kiadás saját statikus fájlja elsőbbséget kap', async () => {
	const h = harness();
	await (await h.caches.open('leardy-static-previous')).put('/icons/icon-192.png', new Response('old icon'));
	await (await h.caches.open(currentCache)).put('/icons/icon-192.png', new Response('new icon'));
	assert.equal(await (await h.fetch('/icons/icon-192.png')).text(), 'new icon');
});

test('Változó URL-ről nem tér vissza korábbi kiadás elavult adata', async () => {
	const h = harness();
	const previous = await h.caches.open('leardy-static-previous');
	await previous.put('/_app/version.json', new Response('old version'));
	await previous.put('/tanulas/__data.json', new Response('old data'));
	assert.equal(await (await h.fetch('/_app/version.json')).text(), 'network');
	assert.equal(await (await h.fetch('/tanulas/__data.json')).text(), 'network');
});

test('Offline újratöltéskor a Tanulás és a lecke saját URL-jén az alkalmazásváz töltődik be', async () => {
	const h = harness(async () => { throw new TypeError('Nincs hálózat.'); });
	await (await h.caches.open(currentCache)).put('/tanulas', new Response('learning shell'));
	for (const path of ['/tanulas', '/tanulas?kereses=honfoglalás', '/tanulas/lecke/lesson#szakasz', '/tanulas/lecke/lesson/']) {
		const response = await h.fetch(path, true);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get('location'), null);
		assert.equal(await response.text(), 'learning shell');
	}
	assert.equal((await h.fetch('/tanulas/szerkeszto', true)).type, 'error');
	const home = await h.fetch('/', true);
	assert.equal(home.headers.get('location'), `${origin}/tanulas`);
});

test('Tiltott vagy sérült Cache Storage mellett az online alkalmazás betöltődik', async () => {
	const h = harness();
	h.caches.open = async () => { throw new DOMException('A tárhely nem elérhető.', 'SecurityError'); };
	assert.equal(await (await h.fetch('/_app/immutable/entry/start.current.js')).text(), 'network');
});

test('Az OAuth-kérés nem kerül a service worker gyorsítótárába', async () => {
	const h = harness();
	assert.equal(await h.fetch('/api/auth/google'), undefined);
});

test('A PWA-frissítés nem indít újratöltést, nem dupláz induláskor, és korlátozza az ébresztési kéréseket', async () => {
	const source = transpile(await readFile(new URL('../src/lib/pwa-client.ts', import.meta.url), 'utf8')).replaceAll('export ', '');
	const document = new EventTarget();
	document.visibilityState = 'visible';
	const window = new EventTarget();
	let now = 0, registrations = 0, updates = 0, release;
	const navigator = { onLine: true, serviceWorker: { async register(url, options) {
		assert.equal(url, '/service-worker.js');
		assert.equal(options.updateViaCache, 'none');
		registrations++;
		return { update() { updates++; return new Promise((resolve) => { release = resolve; }); } };
	} } };
	const stop = vm.runInNewContext(source + '\nstartPwaUpdates();', { navigator, document, window, Date: { now: () => now }, console });
	await new Promise(setImmediate);
	assert.equal(registrations, 1);
	assert.equal(updates, 0);
	window.dispatchEvent(new Event('online'));
	assert.equal(updates, 0);
	now = 61_000;
	for (let i = 0; i < 20; i++) document.dispatchEvent(new Event('visibilitychange'));
	assert.equal(updates, 1);
	release(); await new Promise(setImmediate);
	window.dispatchEvent(new Event('online'));
	assert.equal(updates, 1);
	now = 122_000; document.visibilityState = 'hidden';
	document.dispatchEvent(new Event('visibilitychange'));
	assert.equal(updates, 1);
	document.visibilityState = 'visible'; navigator.onLine = false;
	document.dispatchEvent(new Event('visibilitychange'));
	assert.equal(updates, 1);
	navigator.onLine = true; stop();
	window.dispatchEvent(new Event('online'));
	assert.equal(updates, 1);
});

test('Az ismételt telefonos ébresztési események egy tananyag-ellenőrzést indítanak', async () => {
	const source = transpile(await readFile(new URL('../src/lib/content-client.ts', import.meta.url), 'utf8'))
		.replace(/^import .*\n/gm, '').replaceAll('export ', '');
	const window = new EventTarget(), document = new EventTarget();
	document.visibilityState = 'visible';
	const navigator = { onLine: true, serviceWorker: new EventTarget() };
	let now = 10_000, checks = 0;
	window.addEventListener('leardy-content', () => checks++);
	const stop = vm.runInNewContext(source + '\nstartContentSync();', {
		window, document, navigator, browser: true, CONTENT_EVENT: 'leardy-content', IDENTITY_KEY: 'identity',
		localStorage: {}, Date: { now: () => now }, CustomEvent, URL
	});
	for (let i = 0; i < 20; i++) document.dispatchEvent(new Event('visibilitychange'));
	assert.equal(checks, 1);
	now += 1001; window.dispatchEvent(new Event('online'));
	assert.equal(checks, 2);
	now += 1001; navigator.onLine = false;
	document.dispatchEvent(new Event('visibilitychange'));
	assert.equal(checks, 2);
	navigator.onLine = true; stop();
	document.dispatchEvent(new Event('visibilitychange'));
	assert.equal(checks, 2);
});

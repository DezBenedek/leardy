import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = (await readFile(new URL('../src/lib/back-navigation.ts', import.meta.url), 'utf8'))
	.replace("import { browser } from '$app/environment';", 'const browser = true;')
	.replace("import { afterNavigate, goto } from '$app/navigation';", `
		const afterNavigate = (callback) => globalThis.backTest.callback = callback;
		const goto = (url, options) => globalThis.backTest.calls.push({ url: url.href, options });
	`);
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { createBackNavigation } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const origin = 'http://localhost:5173';

function setup(path, fallback = '/tanulas', options = {}) {
	const runtime = { calls: [], back: 0, callback: null };
	globalThis.backTest = runtime;
	globalThis.window = { location: { href: origin + path }, history: { back: () => runtime.back++ } };
	const goBack = createBackNavigation(() => fallback, options);
	return {
		runtime, goBack,
		navigate(from, type = 'link', routeId = '/tanulas') {
			runtime.callback({
				from: from ? { url: new URL(from, origin), route: { id: routeId } } : null,
				to: { url: new URL(window.location.href) }, type
			});
		}
	};
}

function expectFallback(runtime, path) {
	assert.equal(runtime.back, 0);
	assert.deepEqual(runtime.calls, [{ url: origin + path, options: { replaceState: true } }]);
}

test('A tananyag-szerkesztő mindig a Tanulás oldalra visz, szintváltás után is', () => {
	const { runtime, goBack, navigate } = setup('/tanulas/szerkeszto?level=masodik', '/tanulas', { direct: true });
	for (const from of ['/tanulas', '/tanulas/szerkeszto?level=elso', '/tanulas/szerkeszto/lecke/lecke-1']) {
		runtime.calls = [];
		navigate(from, 'goto');
		goBack();
		expectFallback(runtime, '/tanulas');
	}
});

test('Közvetlen megnyitáskor és újratöltéskor a listaoldalra lép', () => {
	const { runtime, goBack, navigate } = setup('/tanulas/lecke/lecke-1');
	navigate(null, 'enter');
	goBack();
	expectFallback(runtime, '/tanulas');
});

test('Belső listáról érkezve az előzményt használja, megőrizve a szűrőket és a görgetést', () => {
	const { runtime, goBack, navigate } = setup('/tanulas/lecke/lecke-1');
	navigate('/tanulas?subject=tortenelem&level=szint-1');
	goBack();
	assert.equal(runtime.back, 1);
	assert.deepEqual(runtime.calls, []);
});

test('Külső vagy nem az alkalmazáshoz tartozó előzményre nem lép vissza', () => {
	for (const [from, routeId] of [['https://example.com/tanulas', '/tanulas'], ['/tanulas', null]]) {
		const { runtime, goBack, navigate } = setup('/tanulas/lecke/lecke-1');
		navigate(from, 'link', routeId);
		goBack();
		expectFallback(runtime, '/tanulas');
	}
});

test('A részletezőre visszatérve nem nyitja meg újra a szerkesztőt', () => {
	const { runtime, goBack, navigate } = setup('/tanterem/osztaly-1', '/tanterem');
	navigate('/tanterem/osztaly-1/feladat/feladat-1', 'goto');
	goBack();
	expectFallback(runtime, '/tanterem');
});

test('A feladat visszanyila a saját osztályához vezet', () => {
	const { runtime, goBack, navigate } = setup('/tanterem/osztaly-1/feladat/feladat-1', '/tanterem/osztaly-1');
	navigate('/tanterem/masik-osztaly');
	goBack();
	expectFallback(runtime, '/tanterem/osztaly-1');
});

test('Böngészős vissza vagy előre lépés után nem fordítja meg a navigációt', () => {
	for (const from of ['/tanulas', '/tanulas/szerkeszto/lecke/lecke-1']) {
		const { runtime, goBack, navigate } = setup('/tanulas/lecke/lecke-1');
		navigate(from, 'popstate');
		goBack();
		expectFallback(runtime, '/tanulas');
	}
});

test('A lecke bekezdései közötti horgonyváltásból is ki lehet lépni', () => {
	const { runtime, goBack, navigate } = setup('/tanulas/lecke/lecke-1#masodik');
	navigate('/tanulas/lecke/lecke-1#elso');
	goBack();
	expectFallback(runtime, '/tanulas');
});

test('A külön engedélyezett belső kiindulóoldalra visszaléphet', () => {
	const { runtime, goBack, navigate } = setup('/tanulas/lecke/lecke-1', '/tanulas', {
		accept: (url) => url.pathname === '/tanterem/osztaly-1'
	});
	navigate('/tanterem/osztaly-1');
	goBack();
	assert.equal(runtime.back, 1);
});

test('Az alapértelmezett cél az aktuális adatokból készül', () => {
	let room = 'elso';
	const { runtime } = setup('/tanterem/masodik/feladat/feladat-1');
	const goBack = createBackNavigation(() => `/tanterem/${room}`);
	room = 'masodik';
	goBack();
	expectFallback(runtime, '/tanterem/masodik');
});

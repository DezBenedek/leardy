import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileModule } from 'svelte/compiler';
import * as runtime from 'svelte/internal/client';
import ts from 'typescript';

const source = (await readFile(new URL('../src/lib/query.svelte.ts', import.meta.url), 'utf8'))
	.replace("import { browser } from '$app/environment';", 'const browser = true;')
	.replace("import { PRIVATE_APP_CACHE_PREFIX, PRIVATE_CACHE_PREFIX } from './content-protocol';", "const PRIVATE_APP_CACHE_PREFIX = 'leardy-offline-api-v1:'; const PRIVATE_CACHE_PREFIX = 'leardy-private-v2:';")
	.replace("import { onDestroy, untrack } from 'svelte';", "import { untrack } from 'svelte'; const onDestroy = () => {};")
	.replace("import { subscribeContent } from './content-client';", `
		const contentListeners = new Set();
		const subscribeContent = (callback) => { contentListeners.add(callback); return () => contentListeners.delete(callback); };
		export function emitContent(message) { for (const listener of contentListeners) listener(message); }
	`);
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const compiled = compileModule(js, { filename: 'query.svelte.js', generate: 'client' }).js.code
	.replaceAll("'svelte/internal/client'", JSON.stringify(import.meta.resolve('svelte/internal/client')))
	.replaceAll("'svelte'", JSON.stringify(import.meta.resolve('svelte/internal/client')));
const queryUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { Query, invalidate, peek, emitContent } = await import(queryUrl);
const settle = () => new Promise(setImmediate);

test('A Query belső állapota és a fetcher olvasásai nem indítják újra a betöltő effectet', async () => {
	const query = new Query();
	let calls = 0;
	const stop = runtime.effect_root(() => runtime.render_effect(() => {
		query.load('subjects', async () => {
			const previous = query.data;
			if (++calls > 3) throw new Error('Ismétlődő kérés.');
			return { count: (previous?.count ?? 0) + 1 };
		});
	}));
	try {
		await new Promise(setImmediate);
		runtime.flush();
		assert.equal(calls, 1);
		assert.equal(query.data.count, 1);
		query.touch();
		await new Promise(setImmediate);
		runtime.flush();
		assert.equal(calls, 2);
		assert.equal(query.data.count, 2);
	} finally { stop(); query.dispose(); }
});

test('A Kezdőlap friss adata visszalépéskor nem indít kérést, lejáratkor háttérben frissül', async (t) => {
	let now = 1000;
	t.mock.method(Date, 'now', () => now);
	let calls = 0;
	const fetcher = async () => ({ count: ++calls });
	const first = new Query({ revalidate: 'stale' });
	first.load('ttl-test', fetcher, 300_000, 900_000);
	await settle();
	first.dispose();
	now += 60_000;
	const second = new Query({ revalidate: 'stale' });
	try {
		second.load('ttl-test', fetcher, 300_000, 900_000);
		assert.equal(second.data.count, 1);
		assert.equal(second.loading, false);
		await settle();
		assert.equal(calls, 1);
		now += 300_000;
		second.refresh();
		assert.equal(second.data.count, 1);
		assert.equal(second.loading, false);
		await settle();
		assert.equal(calls, 2);
		assert.equal(second.data.count, 2);
		second.touch();
		await settle();
		assert.equal(calls, 3);
	} finally { second.dispose(); }
});

test('Visszatérés a böngészőlapra csak lejárt adatot frissít, valódi változás azonnal érvénytelenít', async (t) => {
	let now = 1000;
	t.mock.method(Date, 'now', () => now);
	let calls = 0;
	const query = new Query({ revalidate: 'stale' });
	try {
		query.load('resume-test', async () => ++calls, 300_000);
		await settle();
		emitContent({ type: 'content-invalidated', reason: 'resume' });
		await settle();
		assert.equal(calls, 1);
		now += 300_001;
		emitContent({ type: 'content-invalidated', reason: 'resume' });
		await settle();
		assert.equal(calls, 2);
		emitContent({ type: 'content-invalidated' });
		await settle();
		assert.equal(calls, 3);
	} finally { query.dispose(); }
});

test('A tananyagok alapértelmezett újraellenőrzése megmarad', async () => {
	let calls = 0;
	const fetcher = async () => ++calls;
	const first = new Query();
	first.load('always-test', fetcher, 300_000);
	await settle();
	first.dispose();
	const second = new Query();
	try {
		second.load('always-test', fetcher, 300_000);
		await settle();
		assert.equal(calls, 2);
	} finally { second.dispose(); }
});

test('Az egyidejű betöltések egyetlen kérést használnak', async () => {
	let finish;
	let calls = 0;
	const fetcher = () => { calls++; return new Promise((resolve) => { finish = resolve; }); };
	const first = new Query({ revalidate: 'stale' });
	const second = new Query({ revalidate: 'stale' });
	try {
		first.load('dedupe-test', fetcher);
		second.load('dedupe-test', fetcher);
		first.refresh();
		assert.equal(calls, 1);
		first.dispose();
		finish({ value: 42 });
		await settle();
		assert.equal(second.data.value, 42);
	} finally { first.dispose(); second.dispose(); }
});

test('Sikertelen háttérfrissítés megtartja a korábbi adatot és újrapróbálható', async (t) => {
	let now = 1000;
	t.mock.method(Date, 'now', () => now);
	let calls = 0;
	const query = new Query({ revalidate: 'stale' });
	try {
		query.load('retry-test', async () => {
			if (++calls === 2) throw new Error('Átmeneti hiba.');
			return calls;
		}, 300_000);
		await settle();
		now += 300_001;
		query.refresh();
		await settle();
		assert.equal(query.data, 1);
		assert.equal(query.error, false);
		query.refresh();
		await settle();
		assert.equal(query.data, 3);
	} finally { query.dispose(); }
});

test('Fiókváltáskor az érvénytelenített folyamatban lévő kérés nem töltheti vissza a régi adatot', async () => {
	let finish;
	const first = new Query({ revalidate: 'stale' });
	first.load('identity-test', () => new Promise((resolve) => { finish = resolve; }));
	first.dispose();
	invalidate('');
	const second = new Query({ revalidate: 'stale' });
	try {
		second.load('identity-test', async () => 'új fiók');
		await settle();
		finish('régi fiók');
		await settle();
		assert.equal(second.data, 'új fiók');
		assert.equal(peek('identity-test'), 'új fiók');
	} finally { second.dispose(); }
});

const mutationSource = (await readFile(new URL('../src/lib/mutation-fetch.ts', import.meta.url), 'utf8'))
	.replace("'./query.svelte'", JSON.stringify(queryUrl))
	.replace("import { contentFetch } from './content-client';", 'const contentFetch = (...args) => fetch(...args);');
const mutationJs = ts.transpileModule(mutationSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { mutationFetch } = await import(`data:text/javascript;base64,${Buffer.from(mutationJs).toString('base64')}`);

test('Csak sikeres módosítás érvényteleníti az érintett kezdőlapi adatot', async (t) => {
	const queries = ['home', 'home-tasks', 'sm2-due'].map((key) => {
		const query = new Query({ revalidate: 'stale' });
		query.load(key, async () => key);
		return query;
	});
	try {
		await settle();
		t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 500 }));
		await mutationFetch('/api/classrooms/room/tasks/task/submissions', { method: 'POST' });
		assert.equal(peek('home-tasks'), 'home-tasks');
		t.mock.method(globalThis, 'fetch', async () => new Response('{"ok":true}'));
		await mutationFetch('/api/classrooms/room/messages', { method: 'POST' });
		assert.equal(peek('home-tasks'), 'home-tasks');
		const response = await mutationFetch('/api/classrooms/room/assignments/assignment/grades', { method: 'PATCH' });
		assert.deepEqual(await response.json(), { ok: true });
		assert.equal(peek('home-tasks'), undefined);
		assert.equal(peek('home'), 'home');
		assert.equal(peek('sm2-due'), 'sm2-due');
		await mutationFetch('/api/library', { method: 'DELETE' });
		assert.equal(peek('sm2-due'), undefined);
		assert.equal(peek('home'), 'home');
		await mutationFetch('/api/progress', { method: 'POST' });
		assert.equal(peek('home'), undefined);
	} finally { queries.forEach((query) => query.dispose()); }
});

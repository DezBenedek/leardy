import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileModule } from 'svelte/compiler';
import * as runtime from 'svelte/internal/client';
import ts from 'typescript';

const source = (await readFile(new URL('../src/lib/query.svelte.ts', import.meta.url), 'utf8'))
	.replace("import { browser } from '$app/environment';", 'const browser = true;')
	.replace("import { onDestroy, untrack } from 'svelte';", "import { untrack } from 'svelte'; const onDestroy = () => {};")
	.replace("import { subscribeContent } from './content-client';", 'const subscribeContent = () => () => {};');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const compiled = compileModule(js, { filename: 'query.svelte.js', generate: 'client' }).js.code
	.replaceAll("'svelte/internal/client'", JSON.stringify(import.meta.resolve('svelte/internal/client')))
	.replaceAll("'svelte'", JSON.stringify(import.meta.resolve('svelte/internal/client')));
const { Query } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

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

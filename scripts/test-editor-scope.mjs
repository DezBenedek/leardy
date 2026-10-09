// Futtatás: node --test scripts/test-editor-scope.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(source) {
	const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
	return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}

const scopeUrl = moduleUrl((await readFile(new URL('../src/lib/scope.ts', import.meta.url), 'utf8'))
	.replace("import { browser } from '$app/environment';", 'const browser = true;'));
const editorScopeUrl = moduleUrl((await readFile(new URL('../src/lib/editor-scope.ts', import.meta.url), 'utf8'))
	.replace("from './scope'", `from '${scopeUrl}'`));
const { loadEditorScopes, rememberEditorScope, findEditableEditorScope } = await import(editorScopeUrl);
const { saveScope } = await import(scopeUrl);

function storage() {
	const values = new Map();
	globalThis.localStorage = {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value)
	};
	return values;
}

test('Az eddigi utolsó választás is visszaállítható, az újabb megnyitás az elejére kerül', () => {
	storage();
	saveScope('tanulas-szerkeszto', { subject: 'history', level: 'old' });
	assert.deepEqual(loadEditorScopes(), [{ subject: 'history', level: 'old' }]);
	rememberEditorScope('grammar', 'new');
	rememberEditorScope('history', 'old');
	rememberEditorScope('', 'invalid');
	assert.deepEqual(loadEditorScopes(), [{ subject: 'history', level: 'old' }, { subject: 'grammar', level: 'new' }]);
});

test('A már nem szerkeszthető előzmény helyett a legutóbbi jogosultat nyitja meg', async () => {
	storage();
	rememberEditorScope('history', 'valid');
	rememberEditorScope('grammar', 'deleted');
	rememberEditorScope('grammar', 'revoked');
	const requests = [];
	const scope = await findEditableEditorScope(loadEditorScopes(), async (subject) => {
		requests.push(subject);
		return subject === 'history' ? [{ id: 'valid', canEdit: true }] : [{ id: 'revoked', canEdit: false }];
	});
	assert.deepEqual(scope, { subject: 'history', level: 'valid' });
	assert.deepEqual(requests, ['grammar', 'history']);
});

test('Jogosult előzmény nélkül a választó marad, sérült tároló nem okoz hibát', async () => {
	const values = storage();
	values.set('leardy-editor-scopes', '{');
	assert.deepEqual(loadEditorScopes(), []);
	values.set('leardy-editor-scopes', JSON.stringify([null, {}, { subject: 'history', level: 1 }]));
	assert.deepEqual(loadEditorScopes(), []);
	assert.equal(await findEditableEditorScope([{ subject: 'history', level: 'revoked' }], async () => []), null);
});

test('Oldalváltás után a késve befejeződő ellenőrzés nem állít vissza tananyagot', async () => {
	let current = true;
	const result = await findEditableEditorScope([{ subject: 'history', level: 'valid' }], async () => {
		current = false;
		return [{ id: 'valid', canEdit: true }];
	}, () => current);
	assert.equal(result, null);
});

const curriculumUrl = moduleUrl(`export const listSubjects = async () => globalThis.scopePageTest.subjects;`);
const editorUrl = moduleUrl(`
	export const editorContext = async () => ({ db: {}, user: {} });
	export const canEnterEditor = async () => globalThis.scopePageTest.canEnter;
	export const canCreateLevel = () => true;
	export const countEditorLevelsBySubject = async () => ({});
	export const getEditorLevels = async (_db, _user, subject) => globalThis.scopePageTest.levels[subject] ?? [];
`);
const pageSource = (await readFile(new URL('../src/routes/tanulas/szerkeszto/+page.server.ts', import.meta.url), 'utf8'))
	.replace("from '@sveltejs/kit'", `from '${import.meta.resolve('@sveltejs/kit')}'`)
	.replace("from '$lib/server/curriculum'", `from '${curriculumUrl}'`)
	.replace("from '$lib/server/curriculum-editor'", `from '${editorUrl}'`);
const { load } = await import(moduleUrl(pageSource));

function pageEvent(search = '') {
	globalThis.scopePageTest = {
		canEnter: true,
		subjects: [{ id: 'history' }],
		levels: { history: [{ id: 'valid', canEdit: true }, { id: 'revoked', canEdit: false }] }
	};
	return { url: new URL(`http://localhost:5173/tanulas/szerkeszto${search}`), setHeaders() {} };
}

test('Érvénytelen vagy jogosulatlan URL a paraméter nélküli szerkesztőre irányít', async () => {
	for (const search of ['?subject=history&level=revoked', '?subject=history&level=deleted', '?subject=missing&level=valid', '?subject=missing', '?level=valid']) {
		await assert.rejects(load(pageEvent(search)), (result) => result.status === 307 && result.location === '/tanulas/szerkeszto');
	}
});

test('Érvényes közvetlen URL elsőbbséget kap, a paraméter nélküli oldal visszaállítható', async () => {
	const selected = await load(pageEvent('?subject=history&level=valid'));
	assert.equal(selected.subjectId, 'history');
	assert.equal(selected.levelId, 'valid');
	assert.deepEqual(selected.levels, [{ id: 'valid', canEdit: true }]);
	const empty = await load(pageEvent());
	assert.equal(empty.levelId, '');
	assert.equal(empty.subjectId, '');
	const subject = await load(pageEvent('?subject=history'));
	assert.equal(subject.subjectId, 'history');
	assert.equal(subject.levelId, '');
});

test('Szerkesztési hozzáférés nélkül továbbra sem nyílik meg a szerkesztő', async () => {
	const event = pageEvent();
	globalThis.scopePageTest.canEnter = false;
	await assert.rejects(load(event), (error) => error.status === 403);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import ts from 'typescript';
import { typescriptModuleUrl } from './typescript-module.mjs';

const editorUrl = await typescriptModuleUrl(new URL('../src/lib/quiz-editor.ts', import.meta.url));
const replacements = {
	'@sveltejs/kit': import.meta.resolve('@sveltejs/kit'),
	'$lib/server/db': await typescriptModuleUrl(new URL('../src/lib/server/db.ts', import.meta.url)),
	'$lib/server/quiz-templates': await typescriptModuleUrl(new URL('../src/lib/server/quiz-templates.ts', import.meta.url)),
	'$lib/quiz-editor': editorUrl,
	'$lib/question-image': await typescriptModuleUrl(new URL('../src/lib/question-image.ts', import.meta.url))
};
let source = await readFile(new URL('../src/routes/api/quiz-templates/+server.ts', import.meta.url), 'utf8');
for (const [name, url] of Object.entries(replacements)) source = source.replaceAll(`from '${name}'`, `from '${url}'`);
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { GET, POST, DELETE } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { QUESTION_TYPES, blankQuestion, seedToDraft, draftToPreview } = await import(editorUrl);
const schema = await readFile(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/0005_quiz_templates.sql', import.meta.url), 'utf8');
const failsWith = status => error => error.status === status;

function testDb() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('PRAGMA foreign_keys=ON');
	sqlite.exec(schema);
	for (const id of ['anna', 'bela']) {
		sqlite.prepare('INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, 0)').run(id, id, `${id}@example.invalid`);
		for (const device of ['telefon', 'gép']) sqlite.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)').run(`${id}-${device}`, id, Date.now() + 60000);
	}
	function prepare(sql, args = []) {
		return {
			bind: (...values) => prepare(sql, values),
			first: async () => sqlite.prepare(sql).get(...args) ?? null,
			all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
			run: async () => ({ meta: { changes: sqlite.prepare(sql).run(...args).changes } }),
			execute: () => ({ results: sqlite.prepare(sql).all(...args) })
		};
	}
	return { sqlite, prepare, async batch(statements) {
		sqlite.exec('BEGIN');
		try { const result = statements.map(statement => statement.execute()); sqlite.exec('COMMIT'); return result; }
		catch (error) { sqlite.exec('ROLLBACK'); throw error; }
	} };
}

function event(db, { method = 'GET', token = 'anna-telefon', body, origin = 'https://leardy.test' } = {}) {
	const url = new URL('https://leardy.test/api/quiz-templates');
	const headers = {};
	return { url, platform: { env: { DB: db } }, cookies: { get: () => token },
		setHeaders: values => Object.assign(headers, values), headers,
		request: new Request(url, { method, headers: { origin, 'content-type': 'application/json' }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) }) };
}

function seed(type = 'choice') {
	return { ...blankQuestion('', type), type, title: 'Saját kérdés', subtitle: 'Tesztsablon', question_text: 'Melyik a helyes válasz?',
		imageUrl: 'https://example.com/kép.png', options: ['Első', 'Második'],
		pairs: type === 'match' ? [{ left: 'Egy', right: 'Első' }, { left: 'Kettő', right: 'Második' }] : [],
		correct_answer: type === 'tf' ? 'Igaz' : 'Első' };
}

test('Ugyanaz a fiók két eszközről ugyanazokat a sablonokat látja, más fiók nem fér hozzá', async () => {
	const db = testDb();
	try {
		const saved = await POST(event(db, { method: 'POST', body: { templates: [seed()], userId: 'bela' } }));
		assert.equal(saved.status, 201);
		const { templates } = await saved.json();
		const secondDevice = event(db, { token: 'anna-gép' });
		assert.deepEqual((await (await GET(secondDevice)).json()).templates, templates);
		assert.equal(secondDevice.headers['cache-control'], 'private, no-store');
		assert.deepEqual((await (await GET(event(db, { token: 'bela-gép' }))).json()).templates, []);
		await assert.rejects(DELETE(event(db, { method: 'DELETE', token: 'bela-telefon', body: { key: templates[0].key, userId: 'anna' } })), failsWith(404));
		assert.equal((await (await GET(event(db))).json()).templates.length, 1);
		await DELETE(event(db, { method: 'DELETE', token: 'anna-gép', body: { key: templates[0].key } }));
		assert.deepEqual((await (await GET(event(db))).json()).templates, []);
	} finally { db.sqlite.close(); }
});

test('Minden kérdéstípus, a kép és a válaszok veszteség nélkül tárolódnak a fiókban', async () => {
	const db = testDb();
	try {
		for (const { id } of QUESTION_TYPES) {
			const original = seed(id);
			const response = await POST(event(db, { method: 'POST', body: { templates: [original] } }));
			const stored = (await response.json()).templates.find(template => template.type === id);
			assert.equal(stored.imageUrl, 'https://example.com/k%C3%A9p.png');
			assert.deepEqual(draftToPreview(seedToDraft(stored, 'kvíz')), draftToPreview(seedToDraft(original, 'kvíz')));
		}
		assert.equal((await (await GET(event(db))).json()).templates.length, QUESTION_TYPES.length);
	} finally { db.sqlite.close(); }
});

test('Bejelentkezés, saját eredet és érvényes kérdés nélkül nem lehet sablont tárolni', async () => {
	const db = testDb();
	try {
		for (const handler of [GET, POST, DELETE]) await assert.rejects(handler(event(db, { method: handler === GET ? 'GET' : handler === POST ? 'POST' : 'DELETE', token: null, body: { templates: [seed()] } })), failsWith(401));
		await assert.rejects(POST(event(db, { method: 'POST', origin: 'https://idegen.test', body: { templates: [seed()] } })), failsWith(403));
		await assert.rejects(GET(event(null)), failsWith(503));
		for (const invalid of [null, {}, { templates: [] }, { templates: [null] }, { templates: [{ ...seed(), type: 'ismeretlen' }] }, { templates: [{ ...seed(), pairs: [null] }] }, { templates: [{ ...seed(), correct_answer: 'Hibás válasz' }] }, { templates: [{ ...seed(), imageUrl: 'javascript:alert(1)' }] }]) {
			await assert.rejects(POST(event(db, { method: 'POST', body: invalid })), failsWith(400));
		}
		await assert.rejects(POST(event(db, { method: 'POST', body: { templates: [seed()], padding: 'a'.repeat(256 * 1024) } })), failsWith(413));
		assert.deepEqual((await (await GET(event(db))).json()).templates, []);
	} finally { db.sqlite.close(); }
});

test('A korábbi sablonok átvétele ismételhető, és a hibás csomag nem mentődik részlegesen', async () => {
	const db = testDb();
	try {
		const body = { templates: [{ ...seed(), key: 'régi-sablon' }], legacy: true };
		await POST(event(db, { method: 'POST', body }));
		await POST(event(db, { method: 'POST', body }));
		assert.equal((await (await GET(event(db))).json()).templates.length, 1);
		await assert.rejects(POST(event(db, { method: 'POST', body: { templates: [seed(), { ...seed(), question_text: '' }] } })), failsWith(400));
		assert.equal((await (await GET(event(db))).json()).templates.length, 1);
		await POST(event(db, { method: 'POST', token: 'bela-gép', body }));
		assert.equal((await (await GET(event(db, { token: 'bela-telefon' }))).json()).templates.length, 1);
		db.sqlite.exec(migration);
		db.sqlite.exec(migration);
		assert.equal((await (await GET(event(db))).json()).templates.length, 1);
		db.sqlite.prepare('DELETE FROM users WHERE id = ?').run('anna');
		assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM quiz_templates').get().count, 1);
	} finally { db.sqlite.close(); }
});

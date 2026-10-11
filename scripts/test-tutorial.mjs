// Futtatás: node --experimental-strip-types --test scripts/test-tutorial.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { TOUR_IDS, TOURS, parseTourMutation, parseTourRecord, tourPath } from '../src/lib/tutorial/definition.ts';
import { readTutorials, writeTutorial } from '../src/lib/server/tutorial.ts';

const migration = await readFile(new URL('../migrations/0007_student_tutorial.sql', import.meta.url), 'utf8');
function database() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec("PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('student'), ('other');");
	sqlite.exec(migration);
	return {
		sqlite,
		prepare(sql) { return { bind(...values) { return {
			async all() { return { results: sqlite.prepare(sql).all(...values) }; },
			async first() { return sqlite.prepare(sql).get(...values) ?? null; },
			async run() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; }
		}; } }; }
	};
}
const mutation = (patch = {}) => ({ tourId: 'basics', version: 1, status: 'active', stepId: 'home', context: {}, revision: 0, operationId: 'operation-start', ...patch });

test('Minden fejezet stabil, egyedi lépésekből áll, és a címek ékezetesek', () => {
	for (const id of TOUR_IDS) {
		const steps = TOURS[id].steps;
		assert.equal(new Set(steps.map(step => step.id)).size, steps.length);
		for (const step of steps) {
			assert.ok(step.title && step.text && step.target.startsWith('[data-tutorial='));
			assert.ok(parseTourMutation(mutation({ tourId: id, stepId: step.id })));
			assert.ok(!step.text.includes(String.fromCodePoint(0x2014)));
		}
	}
});
test('A kérés csak ismert fejezetet, lépést és korlátozott tartalomazonosítókat fogad el', () => {
	for (const invalid of [null, [], {}, mutation({ tourId: 'teacher' }), mutation({ version: 2 }), mutation({ stepId: 'delete' }), mutation({ revision: -1 }), mutation({ revision: 1.5 }), mutation({ status: 'unknown' }), mutation({ operationId: '' }), mutation({ context: [] }), mutation({ context: { lessonId: 7 } }), mutation({ context: { lessonId: 'a'.repeat(201) } }), mutation({ context: { lessonId: '\u0000' } })]) assert.equal(parseTourMutation(invalid), null);
	assert.deepEqual(parseTourMutation(mutation({ context: { userId: 'other', lessonId: 'lecke' } })).context, { lessonId: 'lecke' });
});
test('Az útvonalak biztonságosan kódolják a tartalomazonosítókat', () => {
	assert.equal(tourPath('lesson', {}), null);
	assert.equal(tourPath('room', {}), null);
	assert.equal(tourPath('package', {}), null);
	assert.equal(tourPath('lesson', { lessonId: '../árvíz?x=1' }), '/tanulas/lecke/..%2F%C3%A1rv%C3%ADz%3Fx%3D1');
});
test('Az eltérő verziójú mentés is megakadályozza az ismételt felajánlást', () => {
	const saved = { ...mutation({ version: 2, stepId: 'previous-final-step', status: 'completed', revision: 5 }), updatedAt: 1234 };
	assert.equal(parseTourMutation(saved), null);
	assert.equal(parseTourRecord(saved).status, 'completed');
	assert.equal(parseTourRecord(saved).version, 2);
	assert.equal(parseTourRecord({ ...saved, version: -1 }), null);
});
test('A migráció ismételhető, a még nem látott útmutatónak nincs sora', async () => {
	const db = database();
	try { db.sqlite.exec(migration); assert.deepEqual(await readTutorials(db, 'student'), []); }
	finally { db.sqlite.close(); }
});
test('A fiókok és fejezetek mentése elkülönül, a folytatás kontextusa megmarad', async () => {
	const db = database();
	try {
		await writeTutorial(db, 'student', mutation());
		const next = await writeTutorial(db, 'student', mutation({ revision: 1, operationId: 'operation-pause', status: 'paused', stepId: 'lesson-section', context: { subjectId: 'biology', levelId: 'level', lessonId: 'lesson' } }));
		assert.equal(next.conflict, false); assert.equal(next.state.revision, 2);
		assert.equal(next.state.context.lessonId, 'lesson');
		assert.deepEqual(await readTutorials(db, 'other'), []);
		await writeTutorial(db, 'other', mutation({ status: 'skipped' }));
		await writeTutorial(db, 'student', mutation({ tourId: 'cards', stepId: 'cards-overview' }));
		assert.equal((await readTutorials(db, 'student')).length, 2);
		assert.equal((await readTutorials(db, 'other'))[0].status, 'skipped');
	} finally { db.sqlite.close(); }
});
test('Az elveszett válasz utáni ismétlés idempotens', async () => {
	const db = database();
	try {
		const first = await writeTutorial(db, 'student', mutation());
		const retry = await writeTutorial(db, 'student', mutation());
		assert.deepEqual(retry, first); assert.equal(retry.state.revision, 1);
	} finally { db.sqlite.close(); }
});
test('Két egyidejű indításból csak egy írhatja az első állapotot', async () => {
	const db = database();
	try {
		const results = await Promise.all([writeTutorial(db, 'student', mutation()), writeTutorial(db, 'student', mutation({ operationId: 'operation-other' }))]);
		assert.equal(results.filter(result => result.conflict).length, 1);
		assert.equal((await readTutorials(db, 'student'))[0].revision, 1);
	} finally { db.sqlite.close(); }
});
test('Elavult eszköz nem írhatja felül a befejezést, újrakezdés külön kérhető', async () => {
	const db = database();
	try {
		await writeTutorial(db, 'student', mutation());
		await writeTutorial(db, 'student', mutation({ revision: 1, operationId: 'operation-complete', status: 'completed', stepId: 'tutorial-reopen' }));
		const stale = await writeTutorial(db, 'student', mutation({ revision: 1, operationId: 'operation-stale', stepId: 'nav-learning' }));
		assert.equal(stale.conflict, true); assert.equal(stale.state.status, 'completed');
		assert.equal((await writeTutorial(db, 'student', mutation({ revision: 2, operationId: 'operation-reopen' }))).conflict, true);
		assert.equal((await writeTutorial(db, 'student', mutation({ revision: 2, operationId: 'operation-restart', restart: true }))).conflict, false);
	} finally { db.sqlite.close(); }
});
test('A felhasználó törlése a tutorial állapotát is törli', async () => {
	const db = database();
	try {
		await writeTutorial(db, 'student', mutation());
		db.sqlite.prepare('DELETE FROM users WHERE id = ?').run('student');
		assert.deepEqual(await readTutorials(db, 'student'), []);
	} finally { db.sqlite.close(); }
});

const apiSource = ts.transpileModule(await readFile(new URL('../src/routes/api/tutorial/+server.ts', import.meta.url), 'utf8'), {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText.replace(/^import .*\n/gm, '').replaceAll('export const ', 'const ');
function api(db) {
	return vm.runInNewContext(apiSource + '\n({ GET, PATCH })', {
		getDb: () => db, requireUser: async event => event.user,
		readTutorials, writeTutorial, parseTourMutation, Uint8Array, TextDecoder,
		json: (value, init = {}) => new Response(JSON.stringify(value), { ...init, headers: { 'content-type': 'application/json', ...init.headers } })
	});
}
const event = (user, body, raw = false) => ({ user: user ? { id: user } : null, request: new Request('https://leardy.invalid/api/tutorial', body === undefined ? {} : { method: 'PATCH', body: raw ? body : JSON.stringify(body) }) });
test('Az API hitelesítést kér, és nem gyorsítótáraz személyes állapotot', async () => {
	const db = database();
	try {
		const handlers = api(db);
		for (const response of [await handlers.GET(event(null)), await handlers.PATCH(event(null, mutation()))]) {
			assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'no-store');
		}
		assert.equal((await handlers.GET(event('student'))).status, 200);
	} finally { db.sqlite.close(); }
});
test('Az API a munkamenet fiókjához ment, az ütközés 409-es választ ad', async () => {
	const db = database();
	try {
		const handlers = api(db);
		assert.equal((await handlers.PATCH(event('student', { ...mutation(), userId: 'other' }))).status, 200);
		assert.deepEqual(await (await handlers.GET(event('other'))).json(), { states: [] });
		const conflict = await handlers.PATCH(event('student', mutation({ operationId: 'operation-conflict' })));
		assert.equal(conflict.status, 409); assert.equal((await conflict.json()).state.revision, 1);
	} finally { db.sqlite.close(); }
});
test('Az API elutasítja a hibás és túl nagy kérésfolyamot', async () => {
	const db = database();
	try {
		const handlers = api(db);
		assert.equal((await handlers.PATCH(event('student', '{', true))).status, 400);
		assert.equal((await handlers.PATCH(event('student', mutation({ stepId: 'invalid' })))).status, 400);
		assert.equal((await handlers.PATCH(event('student', 'a'.repeat(4097), true))).status, 413);
	} finally { db.sqlite.close(); }
});

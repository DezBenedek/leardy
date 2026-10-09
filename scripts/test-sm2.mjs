// Futtatás: node --experimental-strip-types --conditions=browser --test scripts/test-sm2.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { compileModule } from 'svelte/compiler';
import { buildDailyWordQueue, buildWordQueue, calculateSM2, gradeSM2, nextReviewText, summarizeSM2, todayDay } from '../src/lib/sm2.ts';

const day = 20000;

test('Az esedékes sikeres ismétlések 1, 6, majd növekvő napközöket kapnak', () => {
	let mark = gradeSM2(undefined, true, day);
	assert.equal(mark.intervalDays, 1);
	mark = gradeSM2(mark, true, mark.dueDay);
	assert.equal(mark.intervalDays, 6);
	mark = gradeSM2(mark, true, mark.dueDay);
	assert.equal(mark.intervalDays, 15);
});

test('Az idő előtti átismétlés megőrzi az esedékességet és a tudásszintet', () => {
	const first = gradeSM2(undefined, true, day);
	const repeated = gradeSM2(first, true, day);
	assert.equal(repeated.repetitions, 1);
	assert.equal(repeated.known, 1);
	assert.equal(repeated.dueDay, first.dueDay);
	assert.equal(repeated.seen, 2);
});

test('Hiba után az aznapi sikeres újrapróbálás egynapos ismétlést kap', () => {
	let mark = gradeSM2(undefined, true, day - 1);
	mark = gradeSM2(mark, true, day);
	mark = gradeSM2(mark, false, day);
	const ease = mark.ease;
	mark = gradeSM2(mark, false, day);
	assert.equal(mark.ease, ease);
	mark = gradeSM2(mark, true, day);
	mark = gradeSM2(mark, true, day);
	assert.equal(mark.repetitions, 1);
	assert.equal(mark.known, 1);
	assert.equal(mark.dueDay, day + 1);
});

test('A már beütemezett szó hibás felidézése újrakezdi a tanulást', () => {
	const mark = gradeSM2({ known: 4, seen: 4, repetitions: 4, ease: 2.5, intervalDays: 38, dueDay: day + 20 }, false, day);
	assert.equal(mark.repetitions, 0);
	assert.equal(mark.known, 0);
	assert.equal(mark.dueDay, day + 1);
});

test('A naptári nap magyar éjfélkor vált, télen és nyáron is', () => {
	for (const [before, after] of [
		['2026-07-01T21:59:59Z', '2026-07-01T22:00:00Z'],
		['2026-01-01T22:59:59Z', '2026-01-01T23:00:00Z']
	]) assert.equal(todayDay(Date.parse(after)), todayDay(Date.parse(before)) + 1);
});

test('A sorban a régebbi esedékes szavak megelőzik az újakat, a jövőbeliek kimaradnak', () => {
	const questions = ['new', 'recent', 'late', 'future', 'late'].map((id) => ({ id }));
	const progress = {
		recent: { seen: 1, dueDay: day },
		late: { seen: 1, dueDay: day - 3 },
		future: { seen: 1, dueDay: day + 6 }
	};
	assert.deepEqual(buildWordQueue(questions, progress, { today: day }).map((q) => q.id), ['late', 'recent', 'new']);
	const summary = summarizeSM2(questions, progress, day);
	assert.equal(summary.total, 4);
	assert.equal(summary.due, 3);
	assert.equal(summary.nextDueDay, day + 6);
	assert.equal(nextReviewText(summary.nextDueDay, day), 'A következő ismétlés 6 nap múlva esedékes.');
});

test('Hibás bemenetből sem keletkezik érvénytelen ütemezés', () => {
	const result = calculateSM2(NaN, -2, Infinity, NaN);
	assert.equal(result.repetitions, 0);
	assert.equal(result.intervalDays, 1);
	assert.ok(Number.isFinite(result.ease) && result.ease >= 1.3);
});

test('Esedékes szavak nélkül is indul legfeljebb húszszavas gyakorlókör', () => {
	const questions = Array.from({ length: 82 }, (_, i) => ({ id: `word-${i}` }));
	const progress = Object.fromEntries(questions.map((q) => [q.id, {
		seen: 2, repetitions: 2, ease: 2.5, intervalDays: 6, dueDay: day + 6
	}]));
	const queue = buildDailyWordQueue([...questions, questions[0]], progress, { today: day });
	assert.equal(queue.length, 20);
	assert.equal(new Set(queue.map((q) => q.id)).size, 20);
	assert.ok(queue.every((q) => q.meta.isFuture));
	assert.equal(gradeSM2(progress[queue[0].id], true, day).dueDay, day + 6);
	assert.equal(buildDailyWordQueue([], {}, { today: day }).length, 0);
	assert.equal(buildDailyWordQueue(questions.slice(0, 3), progress, { today: day }).length, 3);
});

test('Az esedékes és új szavak elsőbbséget kapnak az átismétléssel szemben', () => {
	const questions = ['due', 'new', 'future'].map((id) => ({ id }));
	const progress = { due: { seen: 1, dueDay: day }, future: { seen: 2, dueDay: day + 6 } };
	assert.deepEqual(buildDailyWordQueue(questions, progress, { today: day }).map((q) => q.id), ['due', 'new']);
});

test('Az átismétlés a kevésbé biztos szavakból válogat', () => {
	const questions = ['strong', 'weak', 'hard'].map((id) => ({ id }));
	const progress = {
		strong: { seen: 8, repetitions: 8, ease: 2.5, intervalDays: 100, dueDay: day + 50 },
		weak: { seen: 2, repetitions: 2, ease: 2.5, intervalDays: 6, dueDay: day + 6 },
		hard: { seen: 2, repetitions: 2, ease: 1.5, intervalDays: 6, dueDay: day + 6 }
	};
	assert.deepEqual(buildDailyWordQueue(questions, progress, { today: day, reviewCount: 2 }).map((q) => q.id), ['hard', 'weak']);
});

test('Azonos tudásszintű szavakból véletlen minta készül az eredeti sorrend megváltoztatása nélkül', () => {
	const originalRandom = Math.random;
	try {
		const questions = ['a', 'b', 'c'].map((id) => ({ id }));
		const progress = Object.fromEntries(questions.map((q) => [q.id, { seen: 2, repetitions: 2, dueDay: day + 6 }]));
		const values = [0.9, 0.5, 0.1];
		Math.random = () => values.shift();
		assert.deepEqual(buildDailyWordQueue(questions, progress, { today: day, reviewCount: 2 }).map((q) => q.id), ['c', 'b']);
		assert.deepEqual(questions.map((q) => q.id), ['a', 'b', 'c']);
	} finally { Math.random = originalRandom; }
});

async function importSource(source) {
	const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
	return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

const sm2Url = new URL('../src/lib/sm2.ts', import.meta.url).href;
const activityUrl = new URL('../src/lib/learning-activity.ts', import.meta.url).href;
const reviewSource = (await readFile(new URL('../src/lib/card-review.svelte.ts', import.meta.url), 'utf8'))
	.replace("from './sm2'", `from '${sm2Url}'`)
	.replace("import { invalidate } from './query.svelte';", 'const invalidate = () => {};');
const reviewJs = ts.transpileModule(reviewSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const compiledReview = compileModule(reviewJs, { filename: 'card-review.svelte.js', generate: 'client' }).js.code
	.replace(/['"]svelte\/internal\/client['"]/, JSON.stringify(import.meta.resolve('svelte/internal/client')));
const { CardReviewSession } = await importSource(compiledReview);

test('A sikertelen mentés megmarad és újrapróbálható', async () => {
	const originalFetch = globalThis.fetch;
	const requests = [];
	try {
		globalThis.fetch = async (_url, init) => {
			requests.push(JSON.parse(init.body).results);
			return { ok: requests.length > 1 };
		};
		const session = new CardReviewSession();
		session.mark('word', true);
		assert.equal(await session.flush(), false);
		assert.equal(session.error, true);
		assert.equal(await session.flush(), true);
		assert.deepEqual(requests[0], requests[1]);
		assert.equal(session.progress.word.seen, 1);
		assert.equal(session.error, false);
	} finally { globalThis.fetch = originalFetch; }
});

test('Mentés közben érkező válaszok sorban, kisebb adagokban mentődnek', async () => {
	const originalFetch = globalThis.fetch;
	const requests = [];
	let release;
	try {
		globalThis.fetch = async (_url, init) => {
			requests.push(JSON.parse(init.body).results);
			if (requests.length === 1) await new Promise((resolve) => { release = resolve; });
			return { ok: true };
		};
		const session = new CardReviewSession();
		session.mark('first', false);
		const saving = session.flush();
		for (let i = 0; i < 100; i++) session.mark(`word-${i}`, true);
		assert.equal(session.flush(), saving);
		release();
		assert.equal(await saving, true);
		assert.deepEqual(requests.map((r) => r.length), [1, 80, 20]);
		assert.equal(requests.flat().length, 101);
	} finally { globalThis.fetch = originalFetch; }
});

test('A háttérből érkező régi adat nem írja felül a helyi válaszokat', async () => {
	const originalFetch = globalThis.fetch;
	try {
		globalThis.fetch = async () => ({ ok: true });
		const session = new CardReviewSession();
		session.mark('word', true);
		const merged = session.merge({ word: { seen: 0, known: 0 }, other: { seen: 2 } });
		assert.equal(merged.word.known, 1);
		assert.equal(merged.other.seen, 2);
		await session.flush();
	} finally { globalThis.fetch = originalFetch; }
});

const curriculumSource = await readFile(new URL('../src/lib/server/curriculum.ts', import.meta.url), 'utf8');
const saveSource = curriculumSource.slice(curriculumSource.indexOf('export async function saveCardProgress('));
const { saveCardProgress } = await importSource(`import { gradeSM2, todayDay } from '${sm2Url}'; import { learningDay } from '${activityUrl}'; const resolveDb = (db) => db; ${saveSource}`);

function testDb() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec(`CREATE TABLE card_progress (
		user_id TEXT, card_key TEXT, known INTEGER, seen INTEGER, updated_at TEXT,
		repetitions INTEGER, ease REAL, interval_days INTEGER, due_day INTEGER,
		PRIMARY KEY (user_id, card_key))`);
	sqlite.exec(`CREATE TABLE learning_days (user_id TEXT, day TEXT, PRIMARY KEY (user_id, day))`);
	return {
		sqlite,
		prepare(sql) {
			return { bind(...args) {
				assert.ok(args.length <= 100);
				return {
					all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
					run: () => sqlite.prepare(sql).run(...args)
				};
			} };
		},
		async batch(statements) {
			sqlite.exec('BEGIN');
			try { statements.forEach((s) => s.run()); sqlite.exec('COMMIT'); }
			catch (error) { sqlite.exec('ROLLBACK'); throw error; }
		}
	};
}

test('A szerver és a kliens azonos állapotot számít több aznapi értékelésből', async () => {
	const db = testDb();
	try {
		const answers = [false, true, true];
		await saveCardProgress(db, 'user', answers.map((known) => ({ key: 'word', known })));
		const saved = db.sqlite.prepare('SELECT * FROM card_progress').get();
		const expected = answers.reduce((mark, known) => gradeSM2(mark, known), undefined);
		assert.equal(saved.repetitions, expected.repetitions);
		assert.equal(saved.known, expected.known);
		assert.equal(saved.seen, expected.seen);
		assert.equal(saved.due_day, expected.dueDay);
		await saveCardProgress(db, 'user', [{ key: 'word', known: true }]);
		assert.equal(db.sqlite.prepare('SELECT repetitions FROM card_progress').get().repetitions, 1);
	} finally { db.sqlite.close(); }
});

test('Nagyobb mentés is az adatbázis paraméterkorlátján belül marad', async () => {
	const db = testDb();
	try {
		await saveCardProgress(db, 'user', Array.from({ length: 160 }, (_, i) => ({ key: `word-${i}`, known: true })));
		assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS total FROM card_progress').get().total, 160);
	} finally { db.sqlite.close(); }
});

test('Adatbázis-olvasási hiba esetén a mentés nem nullázza le az előzményeket', async () => {
	const db = testDb();
	try {
		await saveCardProgress(db, 'user', [{ key: 'word', known: true }]);
		const original = db.sqlite.prepare('SELECT * FROM card_progress').get();
		const brokenDb = { ...db, prepare() { throw new Error('Read failed'); } };
		await assert.rejects(saveCardProgress(brokenDb, 'user', [{ key: 'word', known: false }]));
		assert.deepEqual(db.sqlite.prepare('SELECT * FROM card_progress').get(), original);
	} finally { db.sqlite.close(); }
});

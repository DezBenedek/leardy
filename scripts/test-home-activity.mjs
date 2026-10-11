// Futtatás: node --experimental-strip-types --test scripts/test-home-activity.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { learningDay, relativeDeadline, shiftDay, summarizeActivity } from '../src/lib/learning-activity.ts';

const friday = Date.parse('2026-10-09T10:00:00Z');

test('A tanulási nap budapesti éjfélkor vált télen és nyáron', () => {
	assert.equal(learningDay(Date.parse('2026-07-01T21:59:59Z')), '2026-07-01');
	assert.equal(learningDay(Date.parse('2026-07-01T22:00:00Z')), '2026-07-02');
	assert.equal(learningDay(Date.parse('2026-01-01T22:59:59Z')), '2026-01-01');
	assert.equal(learningDay(Date.parse('2026-01-01T23:00:00Z')), '2026-01-02');
});

test('A tegnapig tartó sorozat megmarad, a mai nap külön teljesíthető', () => {
	const stats = summarizeActivity(['2026-10-07', '2026-10-08'], friday);
	assert.equal(stats.streak, 2);
	assert.equal(stats.todayActive, false);
	assert.deepEqual(stats.week.map((day) => day.date), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
	assert.deepEqual(stats.week.filter((day) => day.active).map((day) => day.date), ['2026-10-07', '2026-10-08']);
	const completed = summarizeActivity(['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-09', '2026-10-10'], friday);
	assert.equal(completed.streak, 3);
	assert.equal(completed.todayActive, true);
	assert.equal(completed.week[5].active, false);
});

test('A kihagyott nap megszakítja a sorozatot, az üres állapot nulla nap', () => {
	assert.equal(summarizeActivity(['2026-10-06', '2026-10-07'], friday).streak, 0);
	assert.equal(summarizeActivity(['2026-10-07', '2026-10-09'], friday).streak, 1);
	assert.equal(summarizeActivity([], friday).streak, 0);
});

test('A hét és a sorozat évváltáskor és óraátállításkor is naptári napokból áll', () => {
	const year = summarizeActivity(['2025-12-31', '2026-01-01'], Date.parse('2026-01-01T12:00:00Z'));
	assert.equal(year.streak, 2);
	assert.equal(year.week[0].date, '2025-12-29');
	assert.equal(year.week[6].date, '2026-01-04');
	const sunday = summarizeActivity(['2026-03-28', '2026-03-29'], Date.parse('2026-03-29T12:00:00Z'));
	assert.equal(sunday.streak, 2);
	assert.equal(sunday.week[0].date, '2026-03-23');
	assert.equal(shiftDay('2026-03-29', 1), '2026-03-30');
});

test('A határidő naptári nap szerint relatív, a lejárat percre pontos', () => {
	assert.equal(relativeDeadline(Date.parse('2026-10-09T16:00:00Z'), friday), 'Ma, 18:00');
	assert.equal(relativeDeadline(Date.parse('2026-10-10T16:00:00Z'), friday), 'Holnap, 18:00');
	assert.equal(relativeDeadline(Date.parse('2026-10-12T16:00:00Z'), friday), '3 nap múlva');
	assert.equal(relativeDeadline(friday - 1, friday), 'Lejárt ma, 11:59');
	assert.equal(relativeDeadline(Date.parse('2026-10-08T16:00:00Z'), friday), 'Tegnap lejárt');
	assert.equal(relativeDeadline(Date.parse('2026-10-06T16:00:00Z'), friday), '3 napja lejárt');
	assert.equal(relativeDeadline(Date.parse('2026-03-29T10:00:00Z'), Date.parse('2026-03-28T10:00:00Z')), 'Holnap, 12:00');
});

const source = await readFile(new URL('../src/lib/server/curriculum.ts', import.meta.url), 'utf8');
const activityUrl = new URL('../src/lib/learning-activity.ts', import.meta.url).href;
const sm2Url = new URL('../src/lib/sm2.ts', import.meta.url).href;
const functions = source.slice(source.indexOf('export async function saveLessonProgress('), source.indexOf('export async function getSuggestions('))
	+ source.slice(source.indexOf('export async function saveCardProgress('));
const compiled = ts.transpileModule(`import { learningDay, summarizeActivity } from '${activityUrl}'; import { gradeSM2, todayDay } from '${sm2Url}'; const resolveDb = (db) => db; ${functions}`, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;
const { getHomeStats, saveLessonProgress, saveCardProgress } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const migration = await readFile(new URL('../migrations/0002_learning_days.sql', import.meta.url), 'utf8');

function testDb() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec(`PRAGMA foreign_keys = ON;
		CREATE TABLE users (id TEXT PRIMARY KEY);
		INSERT INTO users VALUES ('student'), ('other');
		CREATE TABLE lesson_progress (user_id TEXT, lesson_id TEXT, done INTEGER, score INTEGER, total INTEGER, updated_at INTEGER, event_at INTEGER DEFAULT 0, PRIMARY KEY (user_id, lesson_id));
		CREATE TABLE card_progress (user_id TEXT, card_key TEXT, known INTEGER, seen INTEGER, updated_at TEXT, repetitions INTEGER, ease REAL, interval_days INTEGER, due_day INTEGER, PRIMARY KEY (user_id, card_key));`);
	sqlite.exec(migration);
	return {
		sqlite,
		prepare(sql) { return { bind(...args) { return {
			all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
			run: () => sqlite.prepare(sql).run(...args)
		}; } }; },
		async batch(statements) {
			sqlite.exec('BEGIN');
			try { statements.forEach((statement) => statement.run()); sqlite.exec('COMMIT'); }
			catch (error) { sqlite.exec('ROLLBACK'); throw error; }
		}
	};
}

test('A leckék és a kártyák közös sorozatot alkotnak, a napi aktivitás ismétléskor megmarad', async (t) => {
	const db = testDb();
	let now = friday - 86_400_000;
	t.mock.method(Date, 'now', () => now);
	try {
		await saveLessonProgress(db, 'student', 'lesson', true, 1, 1);
		now = friday;
		await saveLessonProgress(db, 'student', 'lesson', true, 1, 1);
		await saveCardProgress(db, 'student', [{ key: 'word', known: false }]);
		await saveCardProgress(db, 'student', [{ key: 'word', known: true }]);
		const stats = await getHomeStats(db, 'student');
		assert.equal(stats.streak, 2);
		assert.equal(stats.todayActive, true);
		assert.equal(stats.todayDone, 1);
		assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM learning_days').get().n, 2);
		assert.equal((await getHomeStats(db, 'other')).streak, 0);
		now += 86_400_000;
		await saveCardProgress(db, 'student', [{ key: 'word', known: true }]);
		assert.equal((await getHomeStats(db, 'student')).streak, 3);
	} finally { db.sqlite.close(); }
});

test('A régi másodperces, milliszekundumos és kártyás dátumokból visszanyerhető aktivitás megmarad', async (t) => {
	const db = testDb();
	t.mock.method(Date, 'now', () => friday);
	try {
		db.sqlite.prepare('INSERT INTO lesson_progress (user_id,lesson_id,done,score,total,updated_at) VALUES (?, ?, 1, 1, 1, ?)').run('student', 'seconds', (friday - 2 * 86_400_000) / 1000);
		db.sqlite.prepare('INSERT INTO lesson_progress (user_id,lesson_id,done,score,total,updated_at) VALUES (?, ?, 1, 1, 1, ?)').run('student', 'millis', friday - 86_400_000);
		db.sqlite.prepare('INSERT INTO card_progress (user_id, card_key, seen, updated_at) VALUES (?, ?, 1, ?)').run('student', 'word', new Date(friday).toISOString());
		db.sqlite.prepare('INSERT INTO card_progress (user_id, card_key, seen, updated_at) VALUES (?, ?, 1, ?)').run('student', 'invalid', 'invalid');
		assert.equal((await getHomeStats(db, 'student')).streak, 3);
		db.sqlite.exec('DELETE FROM lesson_progress; DELETE FROM card_progress;');
		assert.equal((await getHomeStats(db, 'student')).streak, 3);
	} finally { db.sqlite.close(); }
});

test('Üres gyakorlás és sikertelen mentés nem hoz létre tanulási napot', async (t) => {
	const db = testDb();
	t.mock.method(Date, 'now', () => friday);
	try {
		await saveCardProgress(db, 'student', []);
		assert.equal((await getHomeStats(db, 'student')).todayActive, false);
		await assert.rejects(saveLessonProgress(db, 'missing-user', 'lesson', true, 1, 1));
		assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM lesson_progress').get().n, 0);
		assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM learning_days').get().n, 0);
	} finally { db.sqlite.close(); }
});

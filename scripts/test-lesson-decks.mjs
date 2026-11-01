// Futtatás: node --test scripts/test-lesson-decks.mjs
// Lecke deckek és kvíz 1:1 szerver műveletek: migrációk, hivatalos deck CRUD,
// teljes listás kártyamentés, ensureLessonQuiz, batch kérdésbeszúrás.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import ts from 'typescript';
import { typescriptModuleUrl } from './typescript-module.mjs';

async function moduleUrl(path, replacements = {}) {
	let source = await readFile(new URL(path, import.meta.url), 'utf8');
	for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`from '${from}'`, `from '${to}'`);
	const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
	return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}

const editorUrl = await typescriptModuleUrl(new URL('../src/lib/server/curriculum/curriculum-editor.ts', import.meta.url));
const { mutateCurriculum, getEditorLessonDecks, getEditorLessonDeckCards } = await import(editorUrl);
const aiUrl = await typescriptModuleUrl(new URL('../src/lib/server/curriculum/ai-generate.ts', import.meta.url));
const { generateAiDrafts } = await import(aiUrl);
const publishedUrl = await typescriptModuleUrl(new URL('../src/lib/server/curriculum/published-decks.ts', import.meta.url));
const { listPublishedDecks, listPublishedDecksForLesson } = await import(publishedUrl);
const subjectsUrl = await typescriptModuleUrl(new URL('../src/lib/server/curriculum/subjects.ts', import.meta.url));
const { listSubjects } = await import(subjectsUrl);

const migrationFiles = (await readdir(new URL('../migrations/', import.meta.url)))
	.filter((f) => f.endsWith('.sql')).sort();
const migrationSql = [];
for (const f of migrationFiles) migrationSql.push(await readFile(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));

function testDb() {
	const sqlite = new DatabaseSync(':memory:');
	for (const sql of migrationSql) sqlite.exec(sql);
	sqlite.exec('PRAGMA foreign_keys=ON');
	for (const [id, email, role] of [['owner', 'owner@example.invalid', 'teacher'], ['editor', 'editor@example.invalid', 'teacher'], ['student', 'student@example.invalid', 'student']]) {
		sqlite.prepare("INSERT INTO users (id, name, email, pass_hash, salt, created_at, role) VALUES (?, ?, ?, '', '', 0, ?)").run(id, id, email, role);
	}
	function prepare(sql, args = []) {
		assert.ok(args.length <= 100, 'A D1 paraméterkorlát nem léphető túl.');
		const statement = () => sqlite.prepare(sql);
		return {
			bind: (...values) => prepare(sql, values),
			first: async () => statement().get(...args) ?? null,
			all: async () => ({ results: statement().all(...args) }),
			run: async () => {
				const result = statement().run(...args);
				return { meta: { changes: result.changes } };
			},
			batchResult: () => statement().all(...args)
		};
	}
	return {
		sqlite, prepare,
		async batch(statements) {
			sqlite.exec('BEGIN');
			try {
				const results = statements.map((statement) => ({ results: statement.batchResult() }));
				sqlite.exec('COMMIT');
				return results;
			} catch (err) { sqlite.exec('ROLLBACK'); throw err; }
		}
	};
}

const owner = { id: 'owner', email: 'owner@example.invalid', role: 'teacher', is_admin: 0 };
const student = { id: 'student', email: 'student@example.invalid', role: 'student', is_admin: 0 };
const failsWith = (status) => (err) => err.status === status;

async function createFixture(db) {
	const subjectId = db.sqlite.prepare('SELECT id FROM subjects ORDER BY sort LIMIT 1').get().id;
	const { id: levelId } = await mutateCurriculum(db, owner, { action: 'createLevel', subjectId, title: 'Saját szint' });
	const { id: topicId } = await mutateCurriculum(db, owner, { action: 'createTopic', levelId, title: 'Témakör' });
	const { id: lessonId } = await mutateCurriculum(db, owner, { action: 'createLesson', levelId, topicId, title: 'Lecke' });
	return { subjectId, levelId, topicId, lessonId };
}

test('A kvíz összevonás után egy leckéhez csak egy kvíz tartozhat', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		const first = await mutateCurriculum(db, owner, { action: 'ensureLessonQuiz', ...fixture });
		const second = await mutateCurriculum(db, owner, { action: 'ensureLessonQuiz', ...fixture });
		assert.equal(first.id, second.id);
		// Régi több-kvízes írás elutasítva.
		await assert.rejects(
			mutateCurriculum(db, owner, { action: 'createQuiz', ...fixture, title: 'Második', sectionSlug: '' }),
			failsWith(409)
		);
	} finally { db.sqlite.close(); }
});

test('Batch kérdésbeszúrás validál és a kvíz végére fűz', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		const { quizId, ids } = await mutateCurriculum(db, owner, {
			action: 'saveLessonQuestions', ...fixture,
			questions: [
				{ type: 'tf', question_text: 'Az ég kék.', options_json: '[]', correct_answer: 'Igaz' },
				{ type: 'choice', question_text: 'Mennyi 2+2?', options_json: '["3","4"]', correct_answer: '4' }
			]
		});
		assert.equal(ids.length, 2);
		assert.ok(quizId);
		await assert.rejects(
			mutateCurriculum(db, owner, { action: 'saveLessonQuestions', ...fixture, quizId, questions: [] }),
			failsWith(400)
		);
		await assert.rejects(
			mutateCurriculum(db, owner, {
				action: 'saveLessonQuestions', ...fixture, quizId,
				questions: [{ type: 'tf', question_text: 'Hibás', options_json: '[]', correct_answer: '' }]
			}),
			failsWith(400)
		);
		await assert.rejects(
			mutateCurriculum(db, student, {
				action: 'saveLessonQuestions', ...fixture, quizId,
				questions: [{ type: 'tf', question_text: 'Diák', options_json: '[]', correct_answer: 'Igaz' }]
			}),
			failsWith(403)
		);
	} finally { db.sqlite.close(); }
});

test('Hivatalos deck létrehozás, listázás, átnevezés, rendezés', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		const a = await mutateCurriculum(db, owner, { action: 'createLessonDeck', ...fixture, title: 'Első csomag' });
		const b = await mutateCurriculum(db, owner, { action: 'createLessonDeck', ...fixture, title: 'Második csomag' });
		const row = db.sqlite.prepare('SELECT user_id, is_lesson, is_public, created_by FROM decks WHERE id = ?').get(a.id);
		assert.equal(row.user_id, 'system');
		assert.equal(row.is_lesson, 1);
		assert.equal(row.is_public, 1);
		assert.equal(row.created_by, 'owner');
		let decks = await getEditorLessonDecks(db, owner, fixture.lessonId);
		assert.deepEqual(decks.map((d) => d.id), [a.id, b.id]);
		await mutateCurriculum(db, owner, { action: 'renameLessonDeck', ...fixture, deckId: a.id, title: 'Átnevezett' });
		assert.equal((await getEditorLessonDecks(db, owner, fixture.lessonId))[0].title, 'Átnevezett');
		await mutateCurriculum(db, owner, { action: 'reorderLessonDecks', ...fixture, ids: [b.id, a.id] });
		decks = await getEditorLessonDecks(db, owner, fixture.lessonId);
		assert.deepEqual(decks.map((d) => d.id), [b.id, a.id]);
		await assert.rejects(
			mutateCurriculum(db, student, { action: 'createLessonDeck', ...fixture, title: 'Diák csomag' }),
			failsWith(403)
		);
		await assert.rejects(
			mutateCurriculum(db, owner, { action: 'renameLessonDeck', ...fixture, deckId: a.id, title: '' }),
			failsWith(400)
		);
	} finally { db.sqlite.close(); }
});

test('Teljes listás kártyamentés: módosítás, beszúrás helyben, törlés', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		const { id } = await mutateCurriculum(db, owner, { action: 'createLessonDeck', ...fixture, title: 'Csomag' });
		const first = await mutateCurriculum(db, owner, {
			action: 'saveLessonDeckCards', ...fixture, deckId: id,
			cards: [
				{ front: 'egy', back: 'one' },
				{ front: 'kettő', back: 'two' },
				{ front: 'három', back: 'three' }
			]
		});
		assert.equal(first.ids.length, 3);
		// Középre beszúrás megőrzi a helyet, egyik kártya törlődik, egyik módosul.
		const second = await mutateCurriculum(db, owner, {
			action: 'saveLessonDeckCards', ...fixture, deckId: id,
			originalIds: first.ids,
			cards: [
				{ id: first.ids[0], front: 'egy', back: 'ONE' },
				{ front: 'másfél', back: 'one-and-half' },
				{ id: first.ids[2], front: 'három', back: 'three' }
			]
		});
		assert.equal(second.ids.length, 3);
		const { cards } = await getEditorLessonDeckCards(db, owner, fixture.lessonId, id);
		assert.deepEqual(cards.map((c) => c.front), ['egy', 'másfél', 'három']);
		assert.equal(cards[0].back, 'ONE');
		// Elavult optimista pillanat elutasítva.
		await assert.rejects(
			mutateCurriculum(db, owner, {
				action: 'saveLessonDeckCards', ...fixture, deckId: id,
				originalIds: first.ids,
				cards: [{ id: second.ids[0], front: 'egy', back: 'one' }]
			}),
			failsWith(409)
		);
		// Üres mentés elutasítva.
		await assert.rejects(
			mutateCurriculum(db, owner, { action: 'saveLessonDeckCards', ...fixture, deckId: id, cards: [] }),
			failsWith(400)
		);
	} finally { db.sqlite.close(); }
});

test('Deck törlés takarítja a könyvtárat és a haladást', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		const { id } = await mutateCurriculum(db, owner, { action: 'createLessonDeck', ...fixture, title: 'Törlendő' });
		const saved = await mutateCurriculum(db, owner, {
			action: 'saveLessonDeckCards', ...fixture, deckId: id,
			cards: [{ front: 'egy', back: 'one' }]
		});
		db.sqlite.prepare('INSERT INTO library (user_id, quiz_id, added_at) VALUES (?, ?, ?)').run('owner', `deck:${id}`, 0);
		db.sqlite.prepare('INSERT INTO card_progress (user_id, card_key, known, seen, updated_at) VALUES (?, ?, 1, 1, ?)').run('owner', saved.ids[0], '');
		await mutateCurriculum(db, owner, { action: 'deleteLessonDeck', ...fixture, deckId: id });
		assert.deepEqual(await getEditorLessonDecks(db, owner, fixture.lessonId), []);
		assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM library').get().n, 0);
		assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM card_progress').get().n, 0);
	} finally { db.sqlite.close(); }
});

test('Idegen deck nem írható a lecke műveletekkel', async () => {
	const db = testDb();
	try {
		const a = await createFixture(db);
		const b = await createFixture(db);
		const { id } = await mutateCurriculum(db, owner, { action: 'createLessonDeck', ...a, title: 'Másik lecke csomagja' });
		await assert.rejects(
			mutateCurriculum(db, owner, { action: 'renameLessonDeck', ...b, deckId: id, title: 'Átírás' }),
			failsWith(404)
		);
		await assert.rejects(
			mutateCurriculum(db, owner, {
				action: 'saveLessonDeckCards', ...b, deckId: id,
				cards: [{ front: 'x', back: 'y' }]
			}),
			failsWith(404)
		);
	} finally { db.sqlite.close(); }
});

function mockAiFetch(payload) {
	globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('AI kvíz generálás validál, hibás sort eldobja', async () => {
	const db = testDb();
	const realFetch = globalThis.fetch;
	try {
		const fixture = await createFixture(db);
		await mutateCurriculum(db, owner, { action: 'saveLesson', ...fixture, title: 'Lecke', body_md: '## Bekezdés\n\nA víz forráspontja 100 fok.', originalTitle: 'Lecke', originalBody: '' });
		mockAiFetch({ choices: [{ message: { content: JSON.stringify({ questions: [
			{ type: 'choice', question_text: 'Mennyi a víz forráspontja?', options: ['90 fok', '100 fok'], correct_answer: '100 fok' },
			{ type: 'tf', question_text: 'A víz 100 fokon forr.', options: [], correct_answer: 'igaz' },
			{ type: 'text', question_text: 'Hány fokon forr a víz?', options: [], correct_answer: '100' },
			{ type: 'essay', question_text: 'Fejtsd ki!', options: [], correct_answer: '' },
			{ type: 'choice', question_text: 'Hibás választás.', options: ['A', 'B'], correct_answer: 'C' }
		] }) } }] });
		const result = await generateAiDrafts(db, owner, { AI_API_KEY: 'test-key' }, { lessonId: fixture.lessonId, kind: 'quiz', count: 5 });
		assert.equal(result.drafts.length, 3);
		assert.equal(result.skipped, 2);
		assert.equal(result.drafts[1].correct_answer, 'Igaz');
		assert.ok(result.drafts.every((d) => d.sectionSlug === ''));
	} finally {
		globalThis.fetch = realFetch;
		db.sqlite.close();
	}
});

test('AI kártya generálás duplikátumot szűr', async () => {
	const db = testDb();
	const realFetch = globalThis.fetch;
	try {
		const fixture = await createFixture(db);
		await mutateCurriculum(db, owner, { action: 'saveLesson', ...fixture, title: 'Lecke', body_md: 'Tartalom a leckében.', originalTitle: 'Lecke', originalBody: '' });
		mockAiFetch({ choices: [{ message: { content: JSON.stringify({ cards: [
			{ front: 'forráspont', back: '100 fok' },
			{ front: 'forráspont', back: '100 fok' },
			{ front: '', back: 'üres előlap' },
			{ front: 'olvadáspont', back: '0 fok' }
		] }) } }] });
		const result = await generateAiDrafts(db, owner, { AI_API_KEY: 'test-key' }, { lessonId: fixture.lessonId, kind: 'cards', count: 4 });
		assert.equal(result.drafts.length, 2);
		assert.equal(result.skipped, 2);
	} finally {
		globalThis.fetch = realFetch;
		db.sqlite.close();
	}
});

test('AI korlát: leckénként óránként 5, darabszám határok', async () => {
	const db = testDb();
	const realFetch = globalThis.fetch;
	try {
		const fixture = await createFixture(db);
		await mutateCurriculum(db, owner, { action: 'saveLesson', ...fixture, title: 'Lecke', body_md: 'Tartalom.', originalTitle: 'Lecke', originalBody: '' });
		mockAiFetch({ choices: [{ message: { content: JSON.stringify({ questions: [] }) } }] });
		for (let i = 0; i < 5; i++) {
			await generateAiDrafts(db, owner, { AI_API_KEY: 'test-key' }, { lessonId: fixture.lessonId, kind: 'quiz', count: 2 });
		}
		await assert.rejects(generateAiDrafts(db, owner, { AI_API_KEY: 'test-key' }, { lessonId: fixture.lessonId, kind: 'quiz', count: 2 }), failsWith(429));
		await assert.rejects(generateAiDrafts(db, owner, { AI_API_KEY: 'test-key' }, { lessonId: fixture.lessonId, kind: 'quiz', count: 0 }), failsWith(400));
		await assert.rejects(generateAiDrafts(db, owner, { AI_API_KEY: 'test-key' }, { lessonId: fixture.lessonId, kind: 'quiz', count: 99 }), failsWith(400));
		await assert.rejects(generateAiDrafts(db, owner, { AI_API_KEY: 'test-key' }, { lessonId: fixture.lessonId, kind: 'cards', count: 21 }), failsWith(400));
	} finally {
		globalThis.fetch = realFetch;
		db.sqlite.close();
	}
});

test('AI több bekezdésre generál, ismeretlen bekötést eldobja', async () => {
	const db = testDb();
	const realFetch = globalThis.fetch;
	try {
		const fixture = await createFixture(db);
		await mutateCurriculum(db, owner, {
			action: 'saveLesson', ...fixture, title: 'Lecke',
			body_md: '## Első\n<!-- section:elso -->\n\nVíz.\n\n## Második\n<!-- section:masodik -->\n\nTűz.',
			originalTitle: 'Lecke', originalBody: ''
		});
		globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: [
			{ type: 'tf', question_text: 'A víz folyik.', options: [], correct_answer: 'Igaz', section_slug: 'elso' },
			{ type: 'tf', question_text: 'A tűz meleg.', options: [], correct_answer: 'Igaz', section_slug: 'masodik' },
			{ type: 'tf', question_text: 'Rossz bekötés.', options: [], correct_answer: 'Igaz', section_slug: 'nincs-ilyen' }
		] }) } }] }), { status: 200 });
		const result = await generateAiDrafts(db, owner, { AI_API_KEY: 'test-key' }, { lessonId: fixture.lessonId, kind: 'quiz', count: 3, sectionSlugs: ['elso', 'masodik'] });
		assert.equal(result.drafts.length, 3);
		assert.deepEqual(result.drafts.map((d) => d.sectionSlug), ['elso', 'masodik', '']);
		assert.equal(result.skipped, 0);
		await assert.rejects(
			generateAiDrafts(db, owner, { AI_API_KEY: 'test-key' }, { lessonId: fixture.lessonId, kind: 'quiz', count: 2, sectionSlugs: ['nincs-ilyen'] }),
			failsWith(400)
		);
	} finally {
		globalThis.fetch = realFetch;
		db.sqlite.close();
	}
});

test('AI fókusz bekerül a promptba, érvénytelen érték visszaáll vegyesre', async () => {
	const db = testDb();
	const realFetch = globalThis.fetch;
	try {
		const fixture = await createFixture(db);
		await mutateCurriculum(db, owner, { action: 'saveLesson', ...fixture, title: 'Lecke', body_md: 'Water is water. Tűz is hot.', originalTitle: 'Lecke', originalBody: '' });
		let captured = '';
		globalThis.fetch = async (_url, opts) => {
			captured = String(JSON.parse(String(opts.body)).messages[1].content);
			return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ cards: [{ front: 'water', back: 'víz' }] }) } }] }), { status: 200 });
		};
		await generateAiDrafts(db, owner, { AI_API_KEY: 'test-key' }, { lessonId: fixture.lessonId, kind: 'cards', count: 1, focus: 'vocab' });
		assert.ok(captured.includes('Fókusz: szószedet'));
		assert.ok(captured.includes('idegen szó'));
		await generateAiDrafts(db, owner, { AI_API_KEY: 'test-key' }, { lessonId: fixture.lessonId, kind: 'cards', count: 1, focus: 'nincs-ilyen' });
		assert.ok(captured.includes('Fókusz: vegyes'));
	} finally {
		globalThis.fetch = realFetch;
		db.sqlite.close();
	}
});

test('Hivatalos deck csak publikált szinten látszik', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		const { id } = await mutateCurriculum(db, owner, { action: 'createLessonDeck', ...fixture, title: 'Csomag' });
		await mutateCurriculum(db, owner, {
			action: 'saveLessonDeckCards', ...fixture, deckId: id,
			cards: [{ front: 'egy', back: 'one' }]
		});
		assert.deepEqual(await listPublishedDecks(db), []);
		assert.deepEqual(await listPublishedDecksForLesson(db, fixture.lessonId), []);
		await mutateCurriculum(db, owner, { action: 'updateLevel', ...fixture, title: 'Szint', published: true });
		assert.equal((await listPublishedDecks(db)).length, 1);
		assert.equal((await listPublishedDecksForLesson(db, fixture.lessonId)).length, 1);
		const subjects = await listSubjects(db);
		const mine = subjects.find((s) => s.id === fixture.subjectId);
		assert.ok((mine.packCount ?? 0) >= 1);
	} finally { db.sqlite.close(); }
});

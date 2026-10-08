// Futtatás: node --test scripts/test-curriculum-editor.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import ts from 'typescript';

async function moduleUrl(path, replacements = {}) {
	let source = await readFile(new URL(path, import.meta.url), 'utf8');
	for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`from '${from}'`, `from '${to}'`);
	const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
	return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}

const dbUrl = await moduleUrl('../src/lib/server/db.ts');
const publicationUrl = await moduleUrl('../src/lib/server/curriculum-publication.ts');
const sm2Url = await moduleUrl('../src/lib/sm2.ts');
const editorUrl = await moduleUrl('../src/lib/server/curriculum-editor.ts', {
	'@sveltejs/kit': import.meta.resolve('@sveltejs/kit'), './db': dbUrl, './curriculum-publication': publicationUrl
});
const curriculumUrl = await moduleUrl('../src/lib/server/curriculum.ts', {
	'./db': dbUrl, './curriculum-publication': publicationUrl, '$lib/sm2': sm2Url
});
const { mutateCurriculum, getEditorLevels, getEditorLesson, canEnterEditor, countEditorLevelsBySubject, searchEditorCandidates } = await import(editorUrl);
const { listSubjects, getSubjectTree, getLessonPage, countQuizzesByLesson, listScopedPackages } = await import(curriculumUrl);
const markdownUrl = await moduleUrl('../src/lib/markdown.ts');
const { splitSections, renderMarkdown } = await import(markdownUrl);
const { parseEditableSections, serializeEditableSections } = await import(await moduleUrl('../src/lib/curriculum-editor.ts', { './markdown': markdownUrl }));
const { cachedEditorSearch } = await import(await moduleUrl('../src/lib/editor-candidate-search.ts'));
const schema = await readFile(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
const editingSchema = await readFile(new URL('../migrations/0009_curriculum_editing.sql', import.meta.url), 'utf8');

function testDb() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec(schema);
	sqlite.exec(editingSchema);
	sqlite.exec('PRAGMA foreign_keys=ON');
	for (const [id, email, role] of [['owner', 'owner@example.invalid', 'teacher'], ['editor', 'editor@example.invalid', 'teacher'], ['student', 'student@example.invalid', 'student']]) {
		sqlite.prepare("INSERT INTO users (id, name, email, pass_hash, salt, created_at, role) VALUES (?, ?, ?, '', '', 0, ?)").run(id, id, email, role);
	}
	function prepare(sql, args = []) {
		assert.ok(args.length <= 100, 'A D1 paraméterkorlátja nem léphető túl.');
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
const editor = { id: 'editor', email: 'editor@example.invalid', role: 'teacher', is_admin: 0 };
const student = { id: 'student', email: 'student@example.invalid', role: 'student', is_admin: 0 };
const failsWith = (status) => (err) => err.status === status;

async function createFixture(db) {
	const subjectId = db.sqlite.prepare('SELECT id FROM subjects ORDER BY sort LIMIT 1').get().id;
	const { id: levelId } = await mutateCurriculum(db, owner, { action: 'createLevel', subjectId, title: 'Saját szint' });
	const { id: topicId } = await mutateCurriculum(db, owner, { action: 'createTopic', levelId, title: 'Témakör' });
	const { id: lessonId } = await mutateCurriculum(db, owner, { action: 'createLesson', levelId, topicId, title: 'Lecke' });
	return { subjectId, levelId, topicId, lessonId };
}

test('Az új szint létrehozója szerkesztő, a piszkozat nyilvánosan nem érhető el', async () => {
	const db = testDb();
	try {
		const before = await listSubjects(db);
		const fixture = await createFixture(db);
		const levels = await getEditorLevels(db, owner, fixture.subjectId);
		const level = levels.find((item) => item.id === fixture.levelId);
		assert.equal(level.ownerId, owner.id);
		assert.equal(level.canEdit, true);
		assert.equal(level.published, false);
		assert.equal(level.materials[0].lessons[0].id, fixture.lessonId);
		assert.ok(!(await getEditorLevels(db, editor, fixture.subjectId)).some((item) => item.id === fixture.levelId));
		assert.ok(!(await getSubjectTree(db, fixture.subjectId)).levels.some((item) => item.id === fixture.levelId));
		assert.equal(await getLessonPage(db, fixture.lessonId), null);
		assert.deepEqual(await listSubjects(db), before);
	} finally { db.sqlite.close(); }
});

test('A tantárgyak szintszáma csak a szerkeszthető szinteket tartalmazza', async () => {
	const db = testDb();
	try {
		const a = await createFixture(db);
		const b = await createFixture(db);
		await mutateCurriculum(db, owner, { action: 'updateLevel', levelId: b.levelId, title: 'Publikált szint', published: true });
		await mutateCurriculum(db, owner, { action: 'addEditor', levelId: a.levelId, email: editor.email });
		await mutateCurriculum(db, owner, { action: 'addEditor', levelId: a.levelId, email: student.email });
		assert.equal((await countEditorLevelsBySubject(db, owner))[a.subjectId], 2);
		assert.equal((await countEditorLevelsBySubject(db, { ...editor, email: editor.email.toUpperCase() }))[a.subjectId], 1);
		assert.equal((await countEditorLevelsBySubject(db, student))[a.subjectId], 1);
		await mutateCurriculum(db, owner, { action: 'removeEditor', levelId: a.levelId, email: editor.email });
		assert.deepEqual(await countEditorLevelsBySubject(db, editor), {});
		const adminCounts = await countEditorLevelsBySubject(db, { ...student, is_admin: 1 });
		assert.equal(Object.values(adminCounts).reduce((sum, count) => sum + count, 0), db.sqlite.prepare('SELECT COUNT(*) AS count FROM levels').get().count);
	} finally { db.sqlite.close(); }
});

test('A publikálás és visszavonása a tanulói olvasási felületre is érvényes', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		await mutateCurriculum(db, owner, { action: 'saveLesson', ...fixture, title: 'Lecke', body_md: '## Bekezdés\n\nTartalom', originalTitle: 'Lecke', originalBody: '' });
		await mutateCurriculum(db, owner, { action: 'updateLevel', ...fixture, title: 'Publikált szint', published: true });
		assert.equal((await getLessonPage(db, fixture.lessonId)).lesson.body_md, '## Bekezdés\n\nTartalom');
		assert.ok((await getSubjectTree(db, fixture.subjectId)).levels.some((item) => item.id === fixture.levelId));
		db.sqlite.prepare("INSERT INTO quizzes (id, lesson_id, title, sort) VALUES ('draft-quiz', ?, 'Kvíz', 0)").run(fixture.lessonId);
		await mutateCurriculum(db, owner, { action: 'updateLevel', ...fixture, title: 'Piszkozat', published: false });
		assert.equal(await getLessonPage(db, fixture.lessonId), null);
		assert.equal((await countQuizzesByLesson(db))[fixture.lessonId], undefined);
		assert.ok(!(await listScopedPackages(db)).some((item) => item.lessonId === fixture.lessonId));
	} finally { db.sqlite.close(); }
});

test('A szerkesztő e-mail-címe kisbetűs, a hozzáférés eltávolítható, a tulajdonos megmarad', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		await assert.rejects(getEditorLesson(db, editor, fixture.lessonId), failsWith(403));
		await mutateCurriculum(db, owner, { action: 'addEditor', ...fixture, email: ' Editor@Example.Invalid ' });
		assert.equal((await getEditorLesson(db, editor, fixture.lessonId)).id, fixture.lessonId);
		await mutateCurriculum(db, owner, { action: 'addEditor', ...fixture, email: student.email });
		assert.equal(await canEnterEditor(db, student), true);
		await assert.rejects(mutateCurriculum(db, student, { action: 'createLevel', subjectId: fixture.subjectId, title: 'Tiltott' }), failsWith(403));
		await assert.rejects(mutateCurriculum(db, owner, { action: 'removeEditor', ...fixture, email: owner.email }), failsWith(400));
		await mutateCurriculum(db, owner, { action: 'removeEditor', ...fixture, email: editor.email });
		await assert.rejects(getEditorLesson(db, editor, fixture.lessonId), failsWith(403));
	} finally { db.sqlite.close(); }
});

test('Idegen szintre és idegen témakörre hivatkozva sem írható át tananyag', async () => {
	const db = testDb();
	try {
		const a = await createFixture(db);
		const b = await createFixture(db);
		await assert.rejects(mutateCurriculum(db, editor, { action: 'renameTopic', ...a, title: 'Tiltott' }), failsWith(403));
		await assert.rejects(mutateCurriculum(db, owner, { action: 'renameTopic', levelId: a.levelId, topicId: b.topicId, title: 'Tiltott' }), failsWith(404));
		await assert.rejects(mutateCurriculum(db, owner, { action: 'deleteLesson', levelId: a.levelId, lessonId: b.lessonId }), failsWith(404));
		const legacyLevel = db.sqlite.prepare('SELECT id FROM levels WHERE id NOT IN (?, ?) LIMIT 1').get(a.levelId, b.levelId).id;
		await assert.rejects(mutateCurriculum(db, owner, { action: 'updateLevel', levelId: legacyLevel, title: 'Tiltott', published: false }), failsWith(403));
	} finally { db.sqlite.close(); }
});

test('A szerkesztőkeresés csak regisztrált, még hozzáadható felhasználókat mutat', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		assert.deepEqual(await searchEditorCandidates(db, owner, fixture.levelId, ''), []);
		assert.deepEqual((await searchEditorCandidates(db, owner, fixture.levelId, 'EXAMPLE.INVALID')).map((user) => user.email), [editor.email, student.email]);
		assert.deepEqual(await searchEditorCandidates(db, owner, fixture.levelId, '%'), []);
		await mutateCurriculum(db, owner, { action: 'addEditor', ...fixture, email: editor.email });
		assert.deepEqual((await searchEditorCandidates(db, editor, fixture.levelId, 'example.invalid')).map((user) => user.email), [student.email]);
		await assert.rejects(mutateCurriculum(db, owner, { action: 'addEditor', ...fixture, email: 'unknown@example.invalid' }), failsWith(404));
		await assert.rejects(searchEditorCandidates(db, owner, fixture.levelId, 'a'.repeat(255)), failsWith(400));
	} finally { db.sqlite.close(); }
});

test('Szinthez kötött szerkesztési jogosultság nélkül nem kereshetők a felhasználók', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		await assert.rejects(searchEditorCandidates(db, student, fixture.levelId, 'example.invalid'), failsWith(403));
		await assert.rejects(searchEditorCandidates(db, editor, fixture.levelId, ''), failsWith(403));
		await assert.rejects(searchEditorCandidates(db, owner, 'missing-level', 'example.invalid'), failsWith(404));
	} finally { db.sqlite.close(); }
});

test('A teljes szerkesztőkeresés helyben szűkíthető, a bővítés új lekérést igényel', () => {
	const users = [{ id: 'anna', name: 'Anna', email: 'anna@example.invalid' }, { id: 'aron', name: 'Áron', email: 'aron@example.invalid' }];
	const cache = new Map([['an', { users, hasMore: false }]]);
	assert.deepEqual(cachedEditorSearch(cache, 'anna').users.map((user) => user.id), ['anna']);
	assert.deepEqual(cachedEditorSearch(cache, 'anx').users, []);
	assert.equal(cachedEditorSearch(cache, 'a'), undefined);
	assert.equal(cachedEditorSearch(cache, 'other'), undefined);
	assert.deepEqual(cachedEditorSearch(new Map([['missing', { users: [], hasMore: false }]]), 'missing-user').users, []);
});

test('A levágott szerkesztőlista nem rejtheti el a pontosabb keresés találatait', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		for (let i = 0; i < 10; i++) {
			db.sqlite.prepare("INSERT INTO users (id, name, email, pass_hash, salt, created_at, role) VALUES (?, ?, ?, '', '', 0, 'teacher')").run(`candidate-${i}`, `Jelölt ${i}`, `candidate-${i}@example.invalid`);
		}
		const users = await searchEditorCandidates(db, owner, fixture.levelId, 'candidate', 9);
		assert.equal(users.length, 9);
		const result = { users: users.slice(0, 8), hasMore: users.length > 8 };
		const cache = new Map([['candidate', result]]);
		assert.equal(cachedEditorSearch(cache, 'candidate'), result);
		assert.equal(cachedEditorSearch(cache, 'candidate-9'), undefined);
		assert.equal((await searchEditorCandidates(db, owner, fixture.levelId, 'candidate-9'))[0].id, 'candidate-9');
	} finally { db.sqlite.close(); }
});

test('A sorrend tartósan mentődik, duplikált és hiányos lista elutasítva', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		const { id: topic2 } = await mutateCurriculum(db, owner, { action: 'createTopic', ...fixture, title: 'Második témakör' });
		const { id: lesson2 } = await mutateCurriculum(db, owner, { action: 'createLesson', ...fixture, title: 'Második lecke' });
		await mutateCurriculum(db, owner, { action: 'reorderTopics', ...fixture, ids: [topic2, fixture.topicId] });
		await mutateCurriculum(db, owner, { action: 'reorderLessons', ...fixture, ids: [lesson2, fixture.lessonId] });
		const level = (await getEditorLevels(db, owner, fixture.subjectId)).find((item) => item.id === fixture.levelId);
		assert.deepEqual(level.materials.map((item) => item.id), [topic2, fixture.topicId]);
		assert.deepEqual(level.materials[1].lessons.map((item) => item.id), [lesson2, fixture.lessonId]);
		await assert.rejects(mutateCurriculum(db, owner, { action: 'reorderTopics', ...fixture, ids: [topic2] }), failsWith(409));
		await assert.rejects(mutateCurriculum(db, owner, { action: 'reorderLessons', ...fixture, ids: [lesson2, lesson2] }), failsWith(400));
	} finally { db.sqlite.close(); }
});

test('Másik szerkesztő változtatásait a régi változat mentése nem írhatja felül', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		const request = { action: 'saveLesson', ...fixture, title: 'Új név', body_md: 'Tartalom', originalTitle: 'Lecke', originalBody: '' };
		await mutateCurriculum(db, owner, request);
		await assert.rejects(mutateCurriculum(db, owner, { ...request, body_md: 'Régi szerkesztő tartalma' }), failsWith(409));
		assert.equal((await getEditorLesson(db, owner, fixture.lessonId)).body_md, 'Tartalom');
	} finally { db.sqlite.close(); }
});

test('A lecke törlése a kapcsolt hivatalos kvízeket is eltávolítja', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		db.sqlite.prepare("INSERT INTO quizzes (id, lesson_id, title) VALUES ('delete-quiz', ?, 'Kvíz')").run(fixture.lessonId);
		await mutateCurriculum(db, owner, { action: 'deleteLesson', ...fixture });
		assert.equal(db.sqlite.prepare('SELECT id FROM lessons WHERE id = ?').get(fixture.lessonId), undefined);
		assert.equal(db.sqlite.prepare("SELECT id FROM quizzes WHERE id = 'delete-quiz'").get(), undefined);
	} finally { db.sqlite.close(); }
});

test('A bevezetés és a címsorok nélküli tartalom is megmarad a bekezdésszerkesztőben', () => {
	const source = 'Bevezető szöveg\n\n## Első cím\n\n**Tartalom**\n\n## Második cím\n\n- Lista';
	assert.deepEqual(parseEditableSections(serializeEditableSections(parseEditableSections(source))), parseEditableSections(source));
	assert.equal(serializeEditableSections(parseEditableSections('Csak szöveg')), 'Csak szöveg');
	assert.deepEqual(parseEditableSections(''), []);
});

test('Azonos és üres slugot adó címek is egyedi bekezdésazonosítót kapnak', () => {
	const sections = splitSections('Bevezető\r\n\r\n## Bevezetés\r\n\r\nElső\r\n\r\n## Bevezetés\r\n\r\nMásodik\r\n\r\n## ☀\r\n\r\nHarmadik');
	assert.deepEqual(sections.map((section) => section.slug), ['bevezetes', 'bevezetes-2', 'bevezetes-3', 'bekezdes']);
	assert.equal(sections[0].intro, true);
	assert.equal(sections[1].intro, false);
	assert.equal(sections[3].md, 'Harmadik');
});

test('Átnevezés és sorrendváltás után is megmarad a kvíz bekezdéskapcsolata', async () => {
	const db = testDb();
	try {
		const fixture = await createFixture(db);
		const original = '## Első cím\n\nTartalom\n\n## Második cím\n\nMásik tartalom';
		await mutateCurriculum(db, owner, { action: 'saveLesson', ...fixture, title: 'Lecke', body_md: original, originalTitle: 'Lecke', originalBody: '' });
		db.sqlite.prepare("INSERT INTO quizzes (id, lesson_id, title, section_slug) VALUES ('stable-quiz', ?, 'Kvíz', 'elso-cim')").run(fixture.lessonId);
		const sections = parseEditableSections(original);
		sections[0].title = 'Teljesen új cím';
		sections.reverse();
		sections.unshift({ id: 'new', title: 'Első cím', md: 'Új tartalom', intro: false });
		const saved = serializeEditableSections(sections);
		await mutateCurriculum(db, owner, { action: 'saveLesson', ...fixture, title: 'Lecke', body_md: saved, originalTitle: 'Lecke', originalBody: original });
		const result = await getEditorLesson(db, owner, fixture.lessonId);
		assert.deepEqual(splitSections(result.body_md).map((section) => section.slug), ['elso-cim-2', 'masodik-cim', 'elso-cim']);
		assert.equal(db.sqlite.prepare("SELECT section_slug FROM quizzes WHERE id = 'stable-quiz'").get().section_slug, 'elso-cim');
		assert.equal(serializeEditableSections(parseEditableSections(saved)), saved);
		assert.ok(!renderMarkdown(saved).includes('section:'));
	} finally { db.sqlite.close(); }
});

test('Száznál több szint is betölthető a D1 paraméterkorlátján belül', async () => {
	const db = testDb();
	try {
		const subjectId = db.sqlite.prepare('SELECT id FROM subjects LIMIT 1').get().id;
		for (let i = 0; i < 105; i++) {
			await mutateCurriculum(db, owner, { action: 'createLevel', subjectId, title: `Saját szint ${i}` });
		}
		assert.equal((await getEditorLevels(db, owner, subjectId)).filter((level) => level.canEdit).length, 105);
	} finally { db.sqlite.close(); }
});

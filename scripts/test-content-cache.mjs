import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { typescriptModuleUrl } from './typescript-module.mjs';

const migrations = await Promise.all(['0001_init.sql', '0002_learning_days.sql', '0003_content_cache.sql', '0004_quiz_question_sections.sql', '0006_lesson_content.sql'].map((name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8')));
async function moduleUrl(path, replacements = {}) {
 let source = await readFile(new URL(path, import.meta.url), 'utf8');
 for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`from '${from}'`, `from '${to}'`);
 return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
}
const dbUrl = await moduleUrl('../src/lib/server/db.ts');
const cacheUrl = await moduleUrl('../src/lib/server/content-cache.ts', { '@sveltejs/kit': import.meta.resolve('@sveltejs/kit'), './db': dbUrl });
const activityUrl = await moduleUrl('../src/lib/learning-activity.ts');
const curriculumUrl = await moduleUrl('../src/lib/server/curriculum.ts', {
 '../lesson-content': await typescriptModuleUrl(new URL('../src/lib/lesson-content.ts', import.meta.url)), '../question-types/registry': await typescriptModuleUrl(new URL('../src/lib/question-types/registry.ts', import.meta.url)), './db': dbUrl, './curriculum-publication': await moduleUrl('../src/lib/server/curriculum-publication.ts'),
 '$lib/sm2': await moduleUrl('../src/lib/sm2.ts'), '$lib/learning-activity': activityUrl
});
const { getLessonPage } = await import(curriculumUrl);
const { fingerprint, publicContent, contentResponse } = await import(cacheUrl);
const { saveProgressEvent } = await import(await moduleUrl('../src/lib/server/progress-events.ts', {
 '@sveltejs/kit': import.meta.resolve('@sveltejs/kit'), './curriculum': curriculumUrl, './content-cache': cacheUrl, '$lib/learning-activity': activityUrl
}));
function database() {
 const sqlite = new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON');
 for (const migration of migrations) sqlite.exec(migration);
 sqlite.exec(`INSERT INTO users (id,name,email,pass_hash,salt,created_at) VALUES ('user','Tanuló','user@example.invalid','','',0),('other','Másik','other@example.invalid','','',0);
 INSERT INTO levels(id,subject_id,title) VALUES ('level','english','Szint'),('other-level','german','Másik szint');
 INSERT INTO materials(id,level_id,title) VALUES ('topic','level','Témakör'),('other-topic','other-level','Másik témakör');
 INSERT INTO lessons(id,material_id,title,body_md) VALUES ('lesson','topic','Lecke','Szöveg');
 INSERT INTO quizzes(id,lesson_id,title) VALUES ('quiz','lesson','Kvíz');
 INSERT INTO quiz_questions(id,quiz_id,question_text,correct_answer) VALUES ('question','quiz','Kérdés','Válasz');`);
 const db = {
  sqlite,
  prepare(sql) {
   const make = (args = []) => ({
    bind(...args) { return make(args); },
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => { const result = sqlite.prepare(sql).run(...args); return { results: [], meta: { changes: Number(result.changes) } }; }
   });
   return make();
  },
  async batch(statements) {
   sqlite.exec('BEGIN');
   try { const results = []; for (const statement of statements) results.push(await statement.all()); sqlite.exec('COMMIT'); return results; }
   catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }
 };
 return db;
}
const revision = (db, scope) => db.sqlite.prepare('SELECT revision FROM curriculum_revisions WHERE scope=?').get(scope).revision;

test('A tartalom módosítása csak az érintett tantárgy és a katalógus verzióját emeli', () => {
 const db = database();
 try {
  const english = revision(db, 'subject:english'), german = revision(db, 'subject:german'), catalog = revision(db, 'catalog');
  db.sqlite.exec("UPDATE lessons SET title='Új cím' WHERE id='lesson'");
  assert.ok(revision(db, 'subject:english') > english);
  assert.equal(revision(db, 'subject:german'), german);
  assert.ok(revision(db, 'catalog') > catalog);
  const next = revision(db, 'catalog');
  db.sqlite.exec("INSERT INTO lesson_progress(user_id,lesson_id,done,updated_at) VALUES ('user','lesson',1,0)");
  assert.equal(revision(db, 'catalog'), next);
 } finally { db.sqlite.close(); }
});
test('Áthelyezés mindkét tantárgyat érvényteleníti, törlés kaszkáddal is emeli a verziót', () => {
 const db = database();
 try {
  const english = revision(db, 'subject:english'), german = revision(db, 'subject:german');
  db.sqlite.exec("UPDATE lessons SET material_id='other-topic' WHERE id='lesson'");
  assert.ok(revision(db, 'subject:english') > english);
  assert.ok(revision(db, 'subject:german') > german);
  const before = revision(db, 'subject:german');
  db.sqlite.exec("DELETE FROM levels WHERE id='other-level'");
  assert.ok(revision(db, 'subject:german') > before);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM lessons').get().n, 0);
 } finally { db.sqlite.close(); }
});
test('A publikálás visszavonása és a kérdések változása érvénytelenít', () => {
 const db = database();
 try {
  const before = revision(db, 'subject:english');
  db.sqlite.exec("INSERT INTO level_settings(level_id,published) VALUES ('level',0)");
  assert.ok(revision(db, 'subject:english') > before);
  const next = revision(db, 'subject:english');
  db.sqlite.exec("UPDATE quiz_questions SET correct_answer='Új válasz' WHERE id='question'");
  assert.ok(revision(db, 'subject:english') > next);
 } finally { db.sqlite.close(); }
});
class MemoryCache {
 entries = new Map();
 async match(key) { return this.entries.get(typeof key === 'string' ? key : key.url)?.clone(); }
 async put(key, response) { this.entries.set(typeof key === 'string' ? key : key.url, response.clone()); }
 async delete(key) { return this.entries.delete(typeof key === 'string' ? key : key.url); }
 async keys() { return [...this.entries.keys()].map((url) => new Request(url)); }
 async addAll() {}
}
test('Edge-találatnál elmarad a tananyag olvasása, új verzió új kulcsot kap', async () => {
 const db = database(); const cache = new MemoryCache(); let reads = 0;
 const event = { platform: { env: { DB: db }, caches: { default: cache } }, url: new URL('https://example.invalid/api/browse') };
 try {
  const load = async () => ({ value: ++reads });
  assert.equal((await publicContent(event, 'tree', 'english', load)).data.value, 1);
  assert.equal((await publicContent(event, 'tree', 'english', load)).data.value, 1);
  assert.equal(reads, 1);
  db.sqlite.exec("UPDATE lessons SET title='Változott' WHERE id='lesson'");
  assert.equal((await publicContent(event, 'tree', 'english', load)).data.value, 2);
  event.platform.caches.default.match = async () => { throw new Error('Cache-hiba'); };
  assert.equal((await publicContent(event, 'tree', 'english', load)).data.value, 3);
 } finally { db.sqlite.close(); }
});
test('ETag: változatlan adat 304, személyes haladás más ETag-et ad', async () => {
 const event = { request: new Request('https://example.invalid/api/browse') };
 const first = await contentResponse(event, { done: false }, 2, 'user');
 const same = await contentResponse({ request: new Request(event.request, { headers: { 'if-none-match': first.headers.get('etag') } }) }, { done: false }, 2, 'user');
 assert.equal(same.status, 304);
 assert.equal(await same.text(), '');
 const changed = await contentResponse(event, { done: true }, 2, 'user');
 assert.notEqual(changed.headers.get('etag'), first.headers.get('etag'));
 assert.equal(first.headers.get('x-content-owner'), 'user');
 assert.match(first.headers.get('cache-control'), /private, no-cache/);
});
async function progress(db, extra = {}) {
 return { eventId: crypto.randomUUID(), userId: 'user', lessonId: 'lesson', quizVersion: await fingerprint((await getLessonPage(db, 'lesson')).quizzes), score: 1, total: 1, occurredAt: Date.parse('2026-10-01T22:30:00Z'), ...extra };
}
test('Megszakadt válasz utáni ismétlés ugyanazt a nyugtát adja és egyszer számít', async () => {
 const db = database();
 try {
  const input = await progress(db);
  assert.equal(await saveProgressEvent(db, 'user', input), 'accepted');
  assert.equal(await saveProgressEvent(db, 'user', input), 'accepted');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM progress_events').get().n, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM learning_days').get().n, 1);
  assert.equal(db.sqlite.prepare('SELECT day FROM learning_days').get().day, '2026-10-02');
  await assert.rejects(saveProgressEvent(db, 'other', input), (e) => e.status === 403);
  await assert.rejects(saveProgressEvent(db, 'user', { ...input, score: 0 }), (e) => e.status === 409);
 } finally { db.sqlite.close(); }
});
test('Régebbi offline eredmény nem írja felül az újabbat', async () => {
 const db = database();
 try {
  const newer = await progress(db, { score: 0 });
  await saveProgressEvent(db, 'user', newer);
  const older = await progress(db, { occurredAt: newer.occurredAt - 86400000 });
  assert.equal(await saveProgressEvent(db, 'user', older), 'superseded');
  assert.equal(db.sqlite.prepare('SELECT score FROM lesson_progress').get().score, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM learning_days').get().n, 2);
 } finally { db.sqlite.close(); }
});
test('Leckeszöveg-változás után menthető, kérdésváltozás vagy törlés után nem menthető', async () => {
 const db = database();
 try {
  const input = await progress(db);
  db.sqlite.exec("UPDATE lessons SET body_md='Új szöveg' WHERE id='lesson'");
  assert.equal(await saveProgressEvent(db, 'user', input), 'accepted');
  db.sqlite.exec("UPDATE quiz_questions SET correct_answer='Másik válasz' WHERE id='question'");
  assert.equal(await saveProgressEvent(db, 'user', { ...input, eventId: crypto.randomUUID() }), 'changed');
  db.sqlite.exec("DELETE FROM lessons WHERE id='lesson'");
  assert.equal(await saveProgressEvent(db, 'user', { ...input, eventId: crypto.randomUUID() }), 'deleted');
 } finally { db.sqlite.close(); }
});

const protocol = ts.transpileModule(await readFile(new URL('../src/lib/content-protocol.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replaceAll('export ', '');
const worker = ts.transpileModule((await readFile(new URL('../src/service-worker.ts', import.meta.url), 'utf8')).replace(/^import .*\n/m, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
function harness(network) {
 const handlers = new Map(), storage = new Map(), messages = [];
 let skipped = false;
 const caches = { async open(name) { if (!storage.has(name)) storage.set(name, new MemoryCache()); return storage.get(name); }, async keys() { return [...storage.keys()]; }, async delete(name) { return storage.delete(name); } };
 const self = { __WB_MANIFEST: [], location: { origin: 'https://example.invalid' }, navigator: { onLine: true }, addEventListener: (type, fn) => handlers.set(type, fn), skipWaiting: async () => { skipped = true; }, clients: { claim: async () => {}, matchAll: async () => [{ postMessage: (message) => messages.push(message) }] } };
 const context = vm.createContext({ self, caches, fetch: network, __APP_BUILD_TIME__: 'test', Request, Response, Headers, URL, URLSearchParams, Date, Map, Set, Promise, Number, Array, String, JSON, console });
 vm.runInContext(protocol + '\n' + worker, context);
 return { caches, messages, storage, manifest: self.__WB_MANIFEST, get skipped() { return skipped; },
  async fetch(path, headers = {}) {
   const waits = []; let response;
   handlers.get('fetch')({ request: new Request(`https://example.invalid${path}`, { headers }), waitUntil: (p) => waits.push(p), respondWith: (p) => response = p });
   const result = await response;
   return { response: result, settled: Promise.all(waits) };
  },
  async message(data) { const waits = []; handlers.get('message')({ data, ports: [], waitUntil: (p) => waits.push(p) }); await Promise.all(waits); },
  async install() { let promise; handlers.get('install')({ waitUntil: (p) => promise = p }); await promise; }
 };
}
const reply = (value, etag = 'v1', owner = 'public') => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', etag, 'x-content-owner': owner } });
test('A worker azonnal visszaadja a régi adatot, majd értesít az újról; azonos URL deduplikálódik', async () => {
 let calls = 0, release;
 const h = harness(async (request) => {
  calls++; assert.equal(request.cache, 'no-store');
  if (calls === 1) return reply({ value: 1 });
  assert.equal(request.headers.get('if-none-match'), 'v1');
  return new Promise((resolve) => release = () => resolve(reply({ value: 2 }, 'v2')));
 });
 const first = await h.fetch('/api/browse'); await first.settled;
 const second = await h.fetch('/api/browse'); const third = await h.fetch('/api/browse');
 assert.equal((await second.response.json()).value, 1);
 assert.equal((await third.response.json()).value, 1);
 assert.equal(calls, 2);
 release(); await Promise.all([second.settled, third.settled]);
 const cached = await h.fetch('/api/browse', { 'x-content-read': 'cached' });
 assert.equal((await cached.response.json()).value, 2);
 assert.equal(calls, 2);
 assert.ok(h.messages.some((m) => m.type === 'content-updated'));
});
test('A 304 megtartja a törzset; 503 esetén offline adat marad; 404 törli azt', async () => {
 let mode = 200;
 const h = harness(async () => mode === 200 ? reply({ value: 1 }) : new Response(null, { status: mode, headers: { 'x-content-owner': 'public' } }));
 const first = await h.fetch('/api/browse'); await first.settled;
 mode = 304; const same = await h.fetch('/api/browse'); await same.settled;
 mode = 503; const failed = await h.fetch('/api/browse'); await failed.settled;
 assert.ok(h.messages.some((m) => m.type === 'content-status' && m.offline));
 const stored = await h.fetch('/api/browse', { 'x-content-read': 'cached' }); assert.equal((await stored.response.json()).value, 1);
 mode = 404; const deleted = await h.fetch('/api/browse'); await deleted.settled;
 const missing = await h.fetch('/api/browse', { 'x-content-read': 'cached' }); assert.equal(missing.response.status, 503);
 assert.ok(h.messages.some((m) => m.type === 'content-deleted'));
});
test('A CDN által lecsupaszított 304 nem indít érvénytelenítési ciklust, és megtartja a tulajdonost', async () => {
 for (const owner of ['public', 'user']) {
  let calls = 0;
  const h = harness(async (request) => {
   if (++calls > 1) {
    assert.equal(request.headers.get('if-none-match'), 'v1');
    return new Response(null, { status: 304, headers: { etag: 'v1' } });
   }
   const response = reply({ value: 1 }, 'v1', owner);
   response.headers.set('x-content-version', '7');
   return response;
  });
  const headers = { 'x-content-user': owner };
  await (await h.fetch('/api/browse?subject=english', headers)).settled;
  h.messages.length = 0;
  await (await h.fetch('/api/browse?subject=english', headers)).settled;
  assert.equal(calls, 2);
  assert.equal(h.messages.some((m) => m.type === 'content-invalidated'), false);
  assert.ok(h.messages.some((m) => m.type === 'content-status' && !m.offline));
  const stored = await h.fetch('/api/browse?subject=english', { ...headers, 'x-content-read': 'cached' });
  assert.equal(stored.response.headers.get('x-content-version'), '7');
  assert.equal(stored.response.headers.get('x-content-owner'), owner);
  assert.deepEqual(await stored.response.json(), { value: 1 });
  if (owner === 'user') assert.equal((await h.fetch('/api/browse?subject=english', { 'x-content-read': 'cached' })).response.status, 503);
 }
});
test('Másik fiók nem kaphatja meg az előző fiók gyorsítótárát', async () => {
 const h = harness(async (req) => reply({ owner: req.headers.get('x-content-user') }, 'v1', req.headers.get('x-content-user')));
 const first = await h.fetch('/api/browse?subject=english', { 'x-content-user': 'user' }); await first.settled;
 const second = await h.fetch('/api/browse?subject=english', { 'x-content-user': 'other', 'x-content-read': 'cached' });
 assert.equal(second.response.status, 503);
 await h.message({ type: 'clear-private-content' });
 assert.equal((await h.caches.keys()).filter((k) => k.startsWith('leardy-private-v2:')).length, 0);
 const cleared = await h.fetch('/api/browse?subject=english', { 'x-content-user': 'user', 'x-content-read': 'cached' });
 assert.equal(cleared.response.status, 503);
});
test('Érvénytelenítés után a korábban indított válasz nem írhatja vissza a régi adatot', async () => {
 let release;
 const h = harness(async () => new Promise((resolve) => release = () => resolve(reply({ old: true }))));
 const request = h.fetch('/api/browse');
 await new Promise((resolve) => setTimeout(resolve, 0));
 await h.message({ type: 'invalidate-content' });
 release(); await (await request).settled;
 const cache = await h.fetch('/api/browse', { 'x-content-read': 'cached' });
 assert.equal(cache.response.status, 503);
});
test('A sikertelen precache-telepítés nem aktiválja az új workert', async () => {
 const h = harness(async () => reply({}));
 const cache = await h.caches.open('leardy-static-test');
 cache.addAll = async () => { throw new Error('Nincs tárhely.'); };
 await assert.rejects(h.install()); assert.equal(h.skipped, false);
});
test('Mobilon a precache legfeljebb hat fájlt kér párhuzamosan, és csak a teljes letöltés után aktivál', async () => {
 const h = harness(async () => reply({}));
 h.manifest.push(...Array.from({ length: 19 }, (_, i) => ({ url: `/app-${i}.js`, revision: null })));
 const batches = [];
 const cache = await h.caches.open('leardy-static-test');
 cache.addAll = async (urls) => {
  assert.equal(h.skipped, false);
  batches.push(urls);
  await Promise.resolve();
 };
 await h.install();
 assert.deepEqual(batches.map((batch) => batch.length), [6, 6, 6, 1]);
 assert.equal(new Set(batches.flat()).size, 19);
 assert.equal(h.skipped, true);
});
test('A késve beérkező régi verzió eldobása nem indít új kérésláncot', async () => {
 let version = 7;
 const h = harness(async () => {
  const response = reply({ subjects: [] });
  response.headers.set('x-content-version', String(version));
  return response;
 });
 await (await h.fetch('/api/browse')).settled;
 h.messages.length = 0;
 version = 6;
 for (let i = 0; i < 4; i++) await (await h.fetch('/api/browse?quizcounts=1')).settled;
 assert.equal(h.messages.some((message) => message.type === 'content-invalidated'), false);
 assert.equal((await h.fetch('/api/browse?quizcounts=1', { 'x-content-read': 'cached' })).response.status, 503);
 assert.equal((await h.fetch('/api/browse', { 'x-content-read': 'cached' })).response.status, 200);
});
test('Megszakadt mobilfrissítés után a félkész precache eltűnik, a működő előző kiadás megmarad', async () => {
 const h = harness(async () => reply({}));
 h.manifest.push(...Array.from({ length: 12 }, (_, i) => ({ url: `/app-${i}.js`, revision: null })));
 await h.caches.open('leardy-static-previous');
 const cache = await h.caches.open('leardy-static-test');
 let batches = 0;
 cache.addAll = async () => {
  if (++batches === 2) throw new TypeError('Megszakadt a kapcsolat.');
  await cache.put('https://example.invalid/app-0.js', new Response('partial'));
 };
 await assert.rejects(h.install());
 assert.equal(batches, 2);
 assert.equal(h.skipped, false);
 assert.deepEqual(await h.caches.keys(), ['leardy-static-previous']);
});

const lessonDocument = (id = 'lesson') => ({ lessonPage: { lesson: { id }, material: { id: 'topic' }, level: { id: 'level' }, subject: { id: 'english' } } });
test('A friss teljes fa törli a hiányzó leckét, a régi párhuzamos kérés nem hozhatja vissza', async () => {
 let release, calls = 0;
 const h = harness(async (request) => {
  if (new URL(request.url).pathname === '/api/browse') return reply({ tree: { id: 'english', levels: [] } });
  if (++calls === 1) return reply(lessonDocument());
  return new Promise((resolve) => release = () => resolve(reply(lessonDocument(), 'old')));
 });
 await (await h.fetch('/api/lessons/lesson')).settled;
 const pending = await h.fetch('/api/lessons/lesson');
 await (await h.fetch('/api/browse?subject=english')).settled;
 release(); await pending.settled;
 assert.equal((await h.fetch('/api/lessons/lesson', { 'x-content-read': 'cached' })).response.status, 503);
 assert.ok(h.messages.some((m) => m.type === 'content-deleted' && m.url.endsWith('/api/lessons/lesson')));
});
test('A teljes fa ellenőrzése a még nem tárolt, késve beérkező törölt leckét is kizárja', async () => {
 let release;
 const h = harness(async (request) => new URL(request.url).pathname === '/api/browse'
  ? reply({ tree: { id: 'english', levels: [] } })
  : new Promise((resolve) => release = () => resolve(reply(lessonDocument()))));
 const pending = h.fetch('/api/lessons/lesson');
 await new Promise((resolve) => setTimeout(resolve, 0));
 await (await h.fetch('/api/browse?subject=english')).settled;
 release(); await (await pending).settled;
 assert.equal((await h.fetch('/api/lessons/lesson', { 'x-content-read': 'cached' })).response.status, 503);
});
test('A szerkesztő törléskor vagy közzététel-visszavonáskor azonnal eltávolítja az érintett offline leckét', async () => {
 for (const change of [{ action: 'deleteLesson', lessonId: 'lesson' }, { action: 'deleteTopic', topicId: 'topic' }, { action: 'updateLevel', levelId: 'level', published: false }]) {
  const h = harness(async () => reply(lessonDocument()));
  await (await h.fetch('/api/lessons/lesson')).settled;
  await h.message({ type: 'invalidate-content', change });
  assert.equal((await h.fetch('/api/lessons/lesson', { 'x-content-read': 'cached' })).response.status, 503);
 }
});
test('A cache mérete legfeljebb 300 bejegyzés, kvótahiba után az élő válasz elérhető', async () => {
 const h = harness(async () => reply({ value: 1 }));
 for (let i = 0; i < 302; i++) await (await h.fetch(`/api/packages?subject=${i}`)).settled;
 const cache = await h.caches.open('leardy-content-v2');
 assert.equal((await cache.keys()).length, 300);
 cache.put = async () => { const error = new Error('Nincs tárhely.'); error.name = 'QuotaExceededError'; throw error; };
 const live = await h.fetch('/api/packages?subject=new');
 await live.settled;
 assert.equal((await live.response.json()).value, 1);
 assert.equal((await (await h.fetch('/api/packages?subject=new', { 'x-content-read': 'cached' })).response.json()).value, 1);
});
test('A személyes csomag verziója független a katalógus verziójától', async () => {
 const h = harness(async (request) => {
  const personal = new URL(request.url).searchParams.has('id');
  const response = reply({ value: personal ? 'deck' : 'catalog' }, 'v1', personal ? 'user' : 'public');
  response.headers.set('x-content-version', personal ? '0' : '100');
  return response;
 });
 await (await h.fetch('/api/browse')).settled;
 await (await h.fetch('/api/packages?id=deck:mine', { 'x-content-user': 'user' })).settled;
 const cached = await h.fetch('/api/packages?id=deck:mine', { 'x-content-user': 'user', 'x-content-read': 'cached' });
 assert.equal((await cached.response.json()).value, 'deck');
});
test('A különböző fa-változatok késve beérkező régi verziója nem előzheti meg az újabbat', async () => {
 let release;
 const versioned = (version) => { const response = reply({ tree: { id: 'english', levels: [] } }); response.headers.set('x-content-version', String(version)); return response; };
 const h = harness(async (request) => new URL(request.url).searchParams.has('quizcounts') ? versioned(2)
  : new Promise((resolve) => release = () => resolve(versioned(1))));
 const old = h.fetch('/api/browse?subject=english');
 await new Promise((resolve) => setTimeout(resolve, 0));
 await (await h.fetch('/api/browse?subject=english&quizcounts=1')).settled;
 release(); await (await old).settled;
 assert.equal((await h.fetch('/api/browse?subject=english', { 'x-content-read': 'cached' })).response.status, 503);
});
test('Az 50 MiB-os keret a válaszok tényleges méretét korlátozza', async () => {
 const h = harness(async () => reply({ body: 'a'.repeat(2 * 1024 * 1024) }));
 for (let i = 0; i < 27; i++) await (await h.fetch(`/api/packages?subject=${i}`)).settled;
 const cache = await h.caches.open('leardy-content-v2');
 let bytes = 0;
 for (const key of await cache.keys()) bytes += (await (await cache.match(key)).arrayBuffer()).byteLength;
 assert.ok(bytes <= 50 * 1024 * 1024);
 assert.ok(bytes >= 46 * 1024 * 1024);
});

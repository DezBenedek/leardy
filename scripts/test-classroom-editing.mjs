import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import ts from 'typescript';
import { typescriptModuleUrl } from './typescript-module.mjs';

const attachmentsUrl = await typescriptModuleUrl(new URL('../src/lib/message-attachments.ts', import.meta.url));
const { attachmentTitle, parseMessageAttachments } = await import(attachmentsUrl);
async function handler(path, method) {
 let source = await readFile(new URL('../src/routes/api/classrooms/[id]/' + path + '/+server.ts', import.meta.url), 'utf8');
 source = source.replace("import { json, type RequestHandler } from '@sveltejs/kit';", 'const json = (value, init = {}) => new Response(JSON.stringify(value), init);');
 source = source.replace("import { getDb, requireUser } from '$lib/server/db';", 'const getDb = event => event.db; const requireUser = async event => event.user;');
 source = source.replace("from '$lib/message-attachments'", `from '${attachmentsUrl}'`);
 const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
 return (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`))[method];
}
const editMessage = await handler('messages/[msgId]', 'PATCH');
const editTask = await handler('tasks/[taskId]', 'PATCH');
const submit = await handler('assignments/[aid]/submissions', 'POST');
function setup() {
 const sql = new DatabaseSync(':memory:');
 sql.exec(`
 CREATE TABLE classrooms (id TEXT PRIMARY KEY, teacher_id TEXT);
 CREATE TABLE classroom_members (classroom_id TEXT, user_id TEXT);
 CREATE TABLE messages (id TEXT PRIMARY KEY, classroom_id TEXT, title TEXT, body TEXT, ref_type TEXT, ref_id TEXT, ref_title TEXT);
 CREATE TABLE message_refs (message_id TEXT, ref_type TEXT, ref_id TEXT, ref_title TEXT, sort INTEGER);
 CREATE TABLE classroom_tasks (id TEXT PRIMARY KEY, classroom_id TEXT, title TEXT, question_count INTEGER, target_pct INTEGER, due_date INTEGER, lesson_ids_json TEXT);
 CREATE TABLE classroom_assignments (id TEXT PRIMARY KEY, classroom_id TEXT, due_date INTEGER, require_text INTEGER, require_images INTEGER, require_files INTEGER, require_audio INTEGER);
 CREATE TABLE assignment_submissions (assignment_id TEXT, user_id TEXT, classroom_id TEXT, text_body TEXT, submitted INTEGER, submitted_at INTEGER, updated_at INTEGER, PRIMARY KEY (assignment_id,user_id));
 CREATE TABLE assignment_uploads (id TEXT, assignment_id TEXT, classroom_id TEXT, user_id TEXT, kind TEXT, r2_key TEXT, file_name TEXT, mime TEXT, size INTEGER, width INTEGER, height INTEGER, created_at INTEGER);
 INSERT INTO classrooms VALUES ('room','teacher');
 INSERT INTO classroom_members VALUES ('room','student');
 INSERT INTO messages VALUES ('message','room','Régi cím','Leírás','lesson','old','Régi lecke');
 INSERT INTO message_refs VALUES ('message','lesson','old','Régi lecke',0);
 INSERT INTO classroom_tasks VALUES ('task','room','Kvíz',10,80,NULL,'[{"id":"old","title":"Régi lecke"}]');
 INSERT INTO classroom_assignments VALUES ('assignment','room',NULL,1,1,1,1);
 `);
 const db = { prepare(query) { let args = []; return { bind(...values) { args=values; return this; }, async first() { return sql.prepare(query).get(...args) ?? null; }, async all() { return { results: sql.prepare(query).all(...args) }; }, async run() { return sql.prepare(query).run(...args); } }; }, async batch(statements) { sql.exec('BEGIN'); try { const result=[]; for (const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); return result; } catch (error) { sql.exec('ROLLBACK'); throw error; } } };
 const event = (body, userId='teacher') => ({ db, user:{id:userId}, params:{id:'room',msgId:'message',taskId:'task',aid:'assignment'}, request:new Request('https://example.invalid/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}) });
 return {sql,db,event};
}

test('A csatolmány címe a tananyag és a kiválasztott elem neve', () => {
 assert.equal(attachmentTitle('Történelem - 7. évfolyam - Ókor - Róma'),'7. évfolyam - Róma');
 assert.equal(attachmentTitle('7. évfolyam - Róma'),'7. évfolyam - Róma');
 assert.equal(attachmentTitle('7. évfolyam - Róma - kezdetek', 'Történelem'),'7. évfolyam - Róma - kezdetek');
 assert.equal(parseMessageAttachments([null,{ref_type:'quiz',ref_id:'q'},{ref_type:'quiz',ref_id:'q'},{ref_type:'unknown',ref_id:'x'}]).length,1);
});

test('Az üzenet csatolmányainak cseréje és teljes törlése mindkét tárolási formát frissíti', async () => {
 const {sql,event}=setup();
 const refs=[{ref_type:'quiz',ref_id:'new',ref_title:'7. évfolyam - Róma'}];
 let response=await editMessage(event({title:'Új cím',body:'Új leírás',refs}));
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).refs,refs);
 assert.equal(sql.prepare('SELECT ref_id FROM messages').get().ref_id,'new');
 assert.equal(sql.prepare('SELECT count(*) AS n FROM message_refs').get().n,1);
 response=await editMessage(event({title:'Új cím',refs:[]}));
 assert.equal(response.status,200);
 assert.equal(sql.prepare('SELECT ref_type FROM messages').get().ref_type,null);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM message_refs').get().n,0);
});

test('A régi kliens megőrzi a csatolmányokat, az idegen tanár nem szerkeszthet', async () => {
 const {sql,event}=setup();
 assert.equal((await editMessage(event({title:'Új cím'}))).status,200);
 assert.equal(sql.prepare('SELECT ref_id FROM messages').get().ref_id,'old');
 assert.equal((await editMessage(event({title:'Másik cím',refs:[]},'stranger'))).status,403);
 assert.equal(sql.prepare('SELECT ref_id FROM messages').get().ref_id,'old');
});

test('A feladat leckéi cserélhetők, üres leckelista nem menthető', async () => {
 const {sql,event}=setup();
 const body={title:'Órai kvíz',question_count:15,target_pct:90,due_date:null,lessons:[{id:'new',title:'7. évfolyam - Róma'}]};
 assert.equal((await editTask(event(body))).status,200);
 assert.deepEqual(JSON.parse(sql.prepare('SELECT lesson_ids_json FROM classroom_tasks').get().lesson_ids_json),body.lessons);
 assert.equal((await editTask(event({...body,lessons:[]}))).status,400);
 assert.equal((await editTask(event(body,'student'))).status,403);
});

test('A beküldött szöveget késői automatikus mentés és újabb beküldés sem írhatja át', async () => {
 const {sql,event}=setup();
 assert.equal((await submit(event({text:'Végleges válasz',submitted:true},'student'))).status,200);
 for (const body of [{text:'Átírt válasz'},{text:'Átírt válasz',submitted:true}]) assert.equal((await submit(event(body,'student'))).status,403);
 assert.equal(sql.prepare('SELECT text_body FROM assignment_submissions').get().text_body,'Végleges válasz');
 // A kifejezett visszavonás megőrzi az eredeti választ, utána ismét piszkozatként szerkeszthető.
 assert.equal((await submit(event({text:'Becsúszó módosítás',submitted:false},'student'))).status,200);
 assert.equal(sql.prepare('SELECT text_body FROM assignment_submissions').get().text_body,'Végleges válasz');
 assert.equal((await submit(event({text:'Új piszkozat'},'student'))).status,200);
});

test('A mentés közben beküldött válaszra az adatbázis feltételes írása is vigyáz', async () => {
 const {sql,db,event}=setup();
 sql.exec("INSERT INTO assignment_submissions VALUES ('assignment','student','room','Piszkozat',0,NULL,0)");
 const prepare=db.prepare.bind(db); let inject=true;
 db.prepare=(query)=>{
  if(inject && query.includes('INSERT INTO assignment_submissions')) { inject=false; sql.exec("UPDATE assignment_submissions SET submitted=1,text_body='Beküldött végleges válasz'"); }
  return prepare(query);
 };
 assert.equal((await submit(event({text:'Elkésett piszkozat'},'student'))).status,200);
 assert.equal(sql.prepare('SELECT text_body FROM assignment_submissions').get().text_body,'Beküldött végleges válasz');
});

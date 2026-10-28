import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { hkdfSync, createDecipheriv } from 'node:crypto';
import test from 'node:test';
import { typescriptModuleUrl } from './typescript-module.mjs';

const push = await import(await typescriptModuleUrl(new URL('../src/lib/server/push.ts', import.meta.url)));
const { runPushSchedule, reminderClock } = await import(await typescriptModuleUrl(new URL('../src/lib/server/push-scheduler.ts', import.meta.url)));
const { pwaManifest } = await import(await typescriptModuleUrl(new URL('../src/lib/pwa-manifest.ts', import.meta.url)));
const now = Date.parse('2026-10-25T19:05:00Z');
const message = { title: 'Új tantermi üzenet', body: 'Holnap gyakorlunk.', url: '/tanterem/room', tag: 'msg:one' };

function setup() {
 const sql = new DatabaseSync(':memory:');
 return readFile(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8').then(async schema => {
  sql.exec(schema);
  sql.exec(`INSERT INTO users (id, name, email, created_at) VALUES ('student', 'Diák', 'student@example.invalid', 0), ('teacher', 'Tanár', 'teacher@example.invalid', 0);
   INSERT INTO classrooms (id, teacher_id, code, name, created_at) VALUES ('room', 'teacher', 'ABC123', 'Osztály', 0);
   INSERT INTO classroom_members VALUES ('room', 'student', 0);`);
  const db = { prepare(query) { let args = []; return { bind(...values) { args = values; return this; }, async first() { return sql.prepare(query).get(...args) ?? null; }, executeSync() { return { results: sql.prepare(query).all(...args) }; }, async all() { return this.executeSync(); }, async run() { const result = sql.prepare(query).run(...args); return { meta: { changes: result.changes } }; } }; }, async batch(statements) { sql.exec('BEGIN'); try { const values = []; for (const statement of statements) values.push(statement.executeSync()); sql.exec('COMMIT'); return values; } catch (error) { sql.exec('ROLLBACK'); throw error; } } };
  await push.ensurePushDeliverySchema(db);
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const sub = { endpoint: 'https://push.example.invalid/device', p256dh: Buffer.from(publicKey).toString('base64url'), auth: Buffer.from(auth).toString('base64url') };
  await push.savePushSubscription(db, 'student', sub);
  const captured = [];
  let status = 201;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { captured.push({ url, ...init }); return new Response('', { status }); };
  return { sql, db, pair, auth, publicKey, sub, captured, setStatus: value => status = value, cleanup() { globalThis.fetch = originalFetch; sql.close(); } };
 });
}

async function queue(h) {
 await push.notifyClassroom(h.db, { ...message, classroomId: 'room', excludeUserId: 'teacher', kind: 'message' });
}

test('A VAPID-kulcs párhuzamos indulásnál is változatlan marad', async () => {
 const h = await setup();
 try {
  const keys = await Promise.all(Array.from({ length: 6 }, () => push.ensureVapidKeys(h.db)));
  assert.equal(new Set(keys.map(key => key.publicKey)).size, 1);
 } finally { h.cleanup(); }
});

test('A valódi küldés VAPID-aláírása helyes, a titkosított üzenet visszafejthető', async () => {
 const h = await setup();
 try {
  assert.equal(await push.sendPushToSubscription(h.db, h.sub, message), true);
  const request = h.captured[0];
  const token = request.headers.Authorization.match(/t=([^,]+)/)[1];
  const [header, payload, signature] = token.split('.');
  const { privateJwk } = await push.ensureVapidKeys(h.db);
  const { d, key_ops, ...publicJwk } = privateJwk;
  const verifyKey = await crypto.subtle.importKey('jwk', { ...publicJwk, key_ops: ['verify'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifyKey, Buffer.from(signature, 'base64url'), Buffer.from(`${header}.${payload}`)), true);
  assert.equal(JSON.parse(Buffer.from(payload, 'base64url')).aud, 'https://push.example.invalid');
  const body = Buffer.from(request.body), salt = body.subarray(0, 16), keyLength = body[20], serverPublic = body.subarray(21, 21 + keyLength);
  const serverKey = await crypto.subtle.importKey('raw', serverPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = Buffer.from(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, h.pair.privateKey, 256));
  const ikm = Buffer.from(hkdfSync('sha256', secret, h.auth, Buffer.concat([Buffer.from('WebPush: info\0'), h.publicKey, serverPublic]), 32));
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const encrypted = body.subarray(21 + keyLength), decipher = createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(encrypted.subarray(-16));
  const plain = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]);
  assert.equal(plain.at(-1), 2);
  assert.deepEqual(JSON.parse(plain.subarray(0, -1)), message);
 } finally { h.cleanup(); }
});

test('Sikertelen küldést a következő futás pótol, párhuzamos feldolgozás nem dupláz', async () => {
 const h = await setup();
 try {
  await queue(h); await queue(h);
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n, 1);
  h.setStatus(503);
  const start = Date.now();
  assert.deepEqual(await push.processPushQueue(h.db, start), { sent: 0, failed: 1 });
  assert.equal(h.sql.prepare('SELECT attempts FROM push_deliveries').get().attempts, 1);
  h.setStatus(201);
  const results = await Promise.all([push.processPushQueue(h.db, start + 3600_000), push.processPushQueue(h.db, start + 3600_000)]);
  assert.equal(results.reduce((sum, r) => sum + r.sent, 0), 1);
  assert.equal(h.captured.length, 2);
 } finally { h.cleanup(); }
});

test('Feliratkozás szinkronizálása megtartja a sort, másik fiók nem kap korábbi üzenetet', async () => {
 const h = await setup();
 try {
  await queue(h);
  await push.savePushSubscription(h.db, 'student', h.sub);
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n, 1);
  await push.savePushSubscription(h.db, 'teacher', h.sub);
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n, 0);
 } finally { h.cleanup(); }
});

test('Némítás és lejárt feliratkozás a már sorban álló küldést is leállítja', async () => {
 const h = await setup();
 try {
  await queue(h);
  h.sql.prepare(`INSERT INTO notification_prefs (user_id, muted_json, updated_at) VALUES ('student', '["room"]', 0)`).run();
  await push.processPushQueue(h.db);
  assert.equal(h.captured.length, 0);
  h.sql.prepare(`UPDATE notification_prefs SET muted_json = '[]'`).run();
  await push.notifyClassroom(h.db, { ...message, tag: 'msg:two', classroomId: 'room', kind: 'message' });
  h.setStatus(410);
  await push.processPushQueue(h.db);
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n, 0);
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n, 0);
 } finally { h.cleanup(); }
});

test('A cron zárt apphoz napi és határidős emlékeztetőt készít, beadott feladathoz nem', async () => {
 const h = await setup();
 try {
  h.sql.exec(`INSERT INTO notification_prefs (user_id, updated_at) VALUES ('student', 0);`);
  h.sql.prepare(`INSERT INTO classroom_tasks (id,classroom_id,teacher_id,title,lesson_ids_json,question_count,target_pct,shuffle,due_date,created_at) VALUES ('task','room','teacher','Gyakorlás','[]',10,80,1,?,0)`).run(now + 3600_000);
  h.sql.prepare(`INSERT INTO classroom_assignments (id,classroom_id,teacher_id,title,description,due_date,created_at) VALUES ('assignment','room','teacher','Beadandó','',?,0)`).run(now + 3600_000);
  h.sql.exec(`INSERT INTO assignment_submissions (assignment_id,user_id,classroom_id,text_body,submitted,updated_at) VALUES ('assignment','student','room','Kész',1,0);`);
  assert.deepEqual(await runPushSchedule(h.db, now), { sent: 2, failed: 0 });
  assert.deepEqual(await runPushSchedule(h.db, now + 300_000), { sent: 0, failed: 0 });
  assert.equal(h.captured.length, 2);
  assert.deepEqual(reminderClock(Date.parse('2026-10-24T18:00:00Z'), 'Europe/Budapest'), { day: '2026-10-24', time: '20:00' });
  assert.deepEqual(reminderClock(Date.parse('2026-10-25T19:00:00Z'), 'Europe/Budapest'), { day: '2026-10-25', time: '20:00' });
 } finally { h.cleanup(); }
});

test('A manifest mindkét témában az alkalmazás hátterével egyező színt ad', () => {
 for (const dark of [true, false]) {
  const manifest = pwaManifest(dark);
  assert.equal(manifest.background_color, dark ? '#0c0a09' : '#ffffff');
  assert.equal(manifest.theme_color, manifest.background_color);
  assert.equal(manifest.id, '/');
  assert.ok(manifest.icons.every(icon => icon.src.startsWith('/icons/')));
 }
});

test('Az emlékeztető új időpontja ugyanazon a napon is jelez, ismételt cron nem dupláz', async () => {
 const h = await setup();
 try {
  h.sql.exec(`INSERT INTO notification_prefs (user_id, updated_at) VALUES ('student', 0);`);
  assert.equal((await runPushSchedule(h.db, now)).sent, 1);
  h.sql.exec(`UPDATE notification_prefs SET reminder_time = '20:07'`);
  assert.equal((await runPushSchedule(h.db, now + 60_000)).sent, 0);
  assert.equal((await runPushSchedule(h.db, now + 120_000)).sent, 1);
  assert.equal((await runPushSchedule(h.db, now + 180_000)).sent, 0);
  assert.equal(h.captured.length, 2);
 } finally { h.cleanup(); }
});

test('A napi emlékeztető külön beállítássor nélkül is elindul zárt appnál', async () => {
 const h = await setup();
 try {
  assert.deepEqual(await runPushSchedule(h.db, now), { sent: 1, failed: 0 });
  assert.equal((await runPushSchedule(h.db, now + 60_000)).sent, 0);
 } finally { h.cleanup(); }
});

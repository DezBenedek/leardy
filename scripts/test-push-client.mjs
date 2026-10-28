import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(await readFile(new URL('../src/lib/push-client.ts', import.meta.url), 'utf8'), {
 compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText.replace(/^import .*\n/gm, '').replaceAll('export ', '');

function harness({ permission = 'granted', existing = true, rotated = false, serverError = false, prefsSaved = true } = {}) {
 const key = new Uint8Array(65).fill(7).buffer;
 const events = [];
 let unsubscribed = 0, subscribed = 0;
 const subscription = { endpoint: 'https://push.example.invalid/device', options: { applicationServerKey: rotated ? new Uint8Array(65).fill(8).buffer : key },
  getKey: type => new Uint8Array(type === 'auth' ? 16 : 65).buffer,
  async unsubscribe() { unsubscribed++; return true; } };
 const Notification = { permission, async requestPermission() { events.push('permission'); this.permission = 'granted'; return 'granted'; } };
 const navigator = { serviceWorker: { ready: Promise.resolve({ pushManager: {
  async getSubscription() { return existing ? subscription : null; }, async subscribe() { subscribed++; return subscription; }
 } }) } };
 const client = vm.runInNewContext(source + '\n({ pushState, subscribePush })', {
  browser: true, dev: false, navigator, window: { PushManager: {}, Notification }, Notification,
  syncNotifPrefs: async () => { events.push('prefs'); return prefsSaved; }, setTimeout, clearTimeout, AbortSignal, Uint8Array, atob, btoa,
  fetch: async (url, init) => { events.push(url); if (url.endsWith('/vapid')) return Response.json({ publicKey: Buffer.from(key).toString('base64url') });
   return Response.json({}, { status: serverError ? 503 : 200 }); }
 });
 return { ...client, events, get unsubscribed() { return unsubscribed; }, get subscribed() { return subscribed; } };
}

test('Az engedélykérés és a szerveres feliratkozás egy koppintásból készül el', async () => {
 const h = harness({ permission: 'default', existing: false });
 const result = h.subscribePush();
 assert.equal(h.events[0], 'permission');
 assert.equal((await result).ok, true);
 assert.equal(h.subscribed, 1);
 assert.ok(h.events.includes('/api/push/subscriptions'));
});

test('A régi VAPID-kulccsal létrejött feliratkozás automatikusan helyreáll', async () => {
 const h = harness({ rotated: true });
 assert.equal(await h.pushState(), 'on');
 assert.equal(h.unsubscribed, 1);
 assert.equal(h.subscribed, 1);
});

test('Szerverhiba nem mutat aktív kapcsolatot, és nem törli az eszköz feliratkozását', async () => {
 const h = harness({ serverError: true });
 assert.equal(await h.pushState(), 'error');
 assert.equal(h.unsubscribed, 0);
});

test('Engedély nélkül a háttérszinkron nem nyit engedélykérő ablakot', async () => {
 const h = harness({ permission: 'default' });
 assert.equal(await h.pushState(), 'off');
 assert.equal(h.events.length, 0);
});

test('Párhuzamos állapotellenőrzés csak egyszer menti a feliratkozást', async () => {
 const h = harness();
 const result = await Promise.all([h.pushState(), h.pushState()]);
 assert.deepEqual(result, ['on', 'on']);
 assert.equal(h.events.filter(event => event === '/api/push/subscriptions').length, 1);
});

test('Engedélyezett értesítésnél a hiányzó eszközfeliratkozás automatikusan helyreáll', async () => {
 const h = harness({ existing: false });
 assert.equal(await h.pushState(), 'on');
 assert.equal(h.subscribed, 1);
 assert.ok(h.events.includes('/api/push/subscriptions'));
 assert.ok(!h.events.includes('permission'));
});

test('Sikertelen beállításmentésnél az állapot nem mutat kész háttérértesítést', async () => {
 const h = harness({ prefsSaved: false });
 assert.equal(await h.pushState(), 'error');
 assert.equal(h.unsubscribed, 0);
});

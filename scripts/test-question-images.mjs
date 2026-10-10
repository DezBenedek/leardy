import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { typescriptModuleUrl } from './typescript-module.mjs';

const imageUrl = await typescriptModuleUrl(new URL('../src/lib/question-image.ts', import.meta.url));
const uploadsUrl = await typescriptModuleUrl(new URL('../src/lib/server/uploads.ts', import.meta.url));
const kitUrl = import.meta.resolve('@sveltejs/kit');
const authUrl = `data:text/javascript;base64,${Buffer.from(`import { error } from '${kitUrl}'; export async function editorContext(event) { if (!event.locals.user) error(401, 'Jelentkezz be.'); return { db: {}, user: event.locals.user }; } export async function getEditorLesson(db, user, id) { if (!user.canEdit || id !== 'test-lesson') error(403, 'Nincs jogosultságod.'); return { id }; }`).toString('base64')}`;
async function routeModule(path) {
	let source = await readFile(new URL(path, import.meta.url), 'utf8');
	for (const [name, url] of Object.entries({ '@sveltejs/kit': kitUrl, '$lib/server/curriculum-editor': authUrl, '$lib/server/uploads': uploadsUrl, '$lib/question-image': imageUrl, ...(path.includes('/lesson-image-upload.ts') ? {} : { '$lib/server/lesson-image-upload': uploadModuleUrl }) })) source = source.replaceAll(`from '${name}'`, `from '${url}'`);
	const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
	return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
const uploadModuleUrl = await routeModule('../src/lib/server/lesson-image-upload.ts');
const { POST } = await import(await routeModule('../src/routes/api/quiz-images/+server.ts'));
const { GET } = await import(await routeModule('../src/routes/api/quiz-images/[id]/+server.ts'));
const { POST: lessonPOST } = await import(await routeModule('../src/routes/api/lesson-images/+server.ts'));
const { GET: lessonGET } = await import(await routeModule('../src/routes/api/lesson-images/[id]/+server.ts'));
const { normalizeQuestionImageUrl, questionImageMime, MAX_QUESTION_IMAGE_BYTES } = await import(imageUrl);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGxkAAAAASUVORK5CYII=', 'base64');
function memoryBucket() {
	const objects = new Map();
	return {
		objects,
		async put(key, bytes, metadata) { objects.set(key, { bytes, metadata }); },
		async get(key) { const object = objects.get(key); return object ? { body: new Response(object.bytes).body, size: object.bytes.byteLength, httpMetadata: object.metadata.httpMetadata, httpEtag: '"test-etag"' } : null; }
	};
}
function event(bucket, { file = new File([png], 'kép.png', { type: 'image/png' }), user = { canEdit: true }, origin = 'https://leardy.test', lessonId = 'test-lesson' } = {}) {
	const form = new FormData();
	form.set('lessonId', lessonId);
	form.set('file', file);
	return { request: new Request('https://leardy.test/api/quiz-images', { method: 'POST', headers: { origin }, body: form }), url: new URL('https://leardy.test/api/quiz-images'), platform: { env: { UPLOADS: bucket } }, locals: { user } };
}
function readEvent(bucket, path, headers = {}) { return { params: { id: path.split('/').at(-1) }, request: new Request(`https://leardy.test${path}`, { headers }), platform: { env: { UPLOADS: bucket } } }; }
const failsWith = status => error => error.status === status;

test('Csak biztonságos külső és saját képhivatkozás menthető', () => {
	assert.equal(normalizeQuestionImageUrl(' https://example.com/kép.png '), 'https://example.com/k%C3%A9p.png');
	assert.equal(normalizeQuestionImageUrl('/api/quiz-images/12345678-1234-1234-1234-123456789abc'), '/api/quiz-images/12345678-1234-1234-1234-123456789abc');
	assert.equal(normalizeQuestionImageUrl(undefined), '');
	for (const value of ['javascript:alert(1)', 'data:image/png;base64,AAA', 'file:///tmp/kép.png', '//example.com/kép.png', '/api/auth/me', 'https://user:pass@example.com/kép.png', {}, 'https://example.com/' + 'a'.repeat(2048)]) assert.equal(normalizeQuestionImageUrl(value), null);
	assert.equal(questionImageMime(png), 'image/png');
	assert.equal(questionImageMime(new TextEncoder().encode('<svg onload="alert(1)">')), null);
});

test('A feltöltött kép visszaolvasható, és ETag alapján gyorsítótárazható', async () => {
	const bucket = memoryBucket();
	const response = await POST(event(bucket));
	assert.equal(response.status, 201);
	const { imageUrl: url } = await response.json();
	assert.ok(normalizeQuestionImageUrl(url));
	const image = await GET(readEvent(bucket, url));
	assert.equal(image.headers.get('content-type'), 'image/png');
	assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
	assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
	const cached = await GET(readEvent(bucket, url, { 'if-none-match': image.headers.get('etag') }));
	assert.equal(cached.status, 304);
});

test('Jogosulatlan, üres, túl nagy és hamis képfeltöltés nem kerül R2-be', async () => {
	const bucket = memoryBucket();
	for (const [options, status] of [
		[{ user: null }, 401], [{ user: { canEdit: false } }, 403], [{ origin: 'https://idegen.test' }, 403], [{ lessonId: 'idegen-lecke' }, 403],
		[{ file: new File([], 'üres.png', { type: 'image/png' }) }, 400],
		[{ file: new File(['<script>alert(1)</script>'], 'hamis.png', { type: 'image/png' }) }, 400],
		[{ file: new File([new Uint8Array(MAX_QUESTION_IMAGE_BYTES + 1)], 'nagy.png', { type: 'image/png' }) }, 413],
		[{ file: new File([new Uint8Array(MAX_QUESTION_IMAGE_BYTES + 131072)], 'túl-nagy.png', { type: 'image/png' }) }, 413]
	]) await assert.rejects(POST(event(bucket, options)), failsWith(status));
	assert.equal(bucket.objects.size, 0);
	await assert.rejects(POST(event(null)), failsWith(503));
	await assert.rejects(POST(event({ put: async () => { throw new Error('R2-hiba'); } })), failsWith(503));
	await assert.rejects(GET(readEvent(bucket, '/api/quiz-images/nincs')), failsWith(404));
	await assert.rejects(GET(readEvent(bucket, '/api/quiz-images/12345678-1234-1234-1234-123456789abc')), failsWith(404));
});

test('A valódi helyi R2 feltöltés után bájtra pontosan kiszolgálja a képet', { skip: process.env.LEARDY_TEST_LOCAL_R2 !== '1' }, async () => {
	const { getPlatformProxy } = await import('wrangler');
	const proxy = await getPlatformProxy({ persist: { path: '/tmp/leardy-quiz-images-r2-test' }, remoteBindings: false });
	const keys = [];
	try {
		for (const [upload, read] of [[POST, GET], [lessonPOST, lessonGET]]) {
			const result = await upload(event(proxy.env.UPLOADS));
			assert.equal(result.status, 201);
			const { imageUrl: url } = await result.json();
			keys.push(url.replace('/api/', ''));
			const image = await read(readEvent(proxy.env.UPLOADS, url));
			assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
		}
	} finally {
		for (const key of keys) await proxy.env.UPLOADS.delete(key);
		await proxy.dispose();
	}
});


test('A lecke képfeltöltése külön R2-névteret használ, azonos jogosultságellenőrzéssel', async () => {
 const bucket = memoryBucket();
 const response = await lessonPOST(event(bucket));
 const { imageUrl } = await response.json();
 assert.match(imageUrl, /^\/api\/lesson-images\//);
 assert.deepEqual(Buffer.from(await (await lessonGET(readEvent(bucket, imageUrl))).arrayBuffer()), png);
 await assert.rejects(GET(readEvent(bucket, imageUrl)), failsWith(404));
 await assert.rejects(lessonPOST(event(bucket, { user: null })), failsWith(401));
 await assert.rejects(lessonPOST(event(bucket, { user: { canEdit: false } })), failsWith(403));
});

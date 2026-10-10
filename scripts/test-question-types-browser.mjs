// Futtatás élő Vite mellett: playwriter -s <saját munkamenet> -f scripts/test-question-types-browser.mjs --timeout 60000
const assert = require('assert').strict;

state.page ??= await context.newPage();
await state.page.unroute('**/__question_types_test__');
await state.page.route('**/__question_types_test__', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="hu"><head><meta charset="utf-8"><script type="module">import "/src/app.css";</script></head><body></body></html>' }));
await state.page.goto('http://localhost:5173/__question_types_test__');

async function observe() {
	console.log(await snapshot({ page: state.page }));
	const logs = await getLatestLogs({ page: state.page, sinceLastCall: true });
	console.log(logs);
	assert.equal(logs.some((log) => /ResizeObserver loop|effect_update_depth_exceeded|Uncaught|hydration_mismatch/.test(log)), false, JSON.stringify(logs));
}

async function mountFixture(props) {
	await state.page.evaluate(async (props) => {
		const response = await fetch('/src/lib/components/QuizRunner.svelte');
		const compiled = await response.text();
		const version = compiled.match(/svelte[^"']*\.js\?v=([a-z0-9]+)/)?.[1];
		const { mount, unmount } = await import(`/node_modules/.vite/deps/svelte.js?v=${version}`);
		if (window.__questionTypeFixture) await unmount(window.__questionTypeFixture);
		window.__questionTypeTarget?.remove();
		const target = document.createElement('section');
		target.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow:auto;background:var(--color-white);padding:16px;';
		document.body.append(target);
		window.__questionTypeTarget = target;
		const { default: Fixture } = await import('/src/lib/question-types/__tests__/QuestionTypes.svelte');
		window.__questionTypeFixture = mount(Fixture, { target, props });
	}, props);
	await observe();
}

async function click(locator) { await locator.click(); await observe(); }
async function fill(locator, value) { await locator.fill(value); await observe(); }
const button = (name) => state.page.getByRole('button', { name, exact: true });

/** SVG-végpontokat vetünk össze a tényleges DOM-gombok képernyőbeli szélével. */
async function checkConnections(expected) {
	let lastError;
	for (let attempt = 0; attempt < 20; attempt++) {
		try {
			const paths = state.page.locator('[data-match-connection]');
			assert.equal(await paths.count(), Object.keys(expected).length);
			const svg = state.page.locator('.match-connections');
			const svgBox = await svg.boundingBox();
			const [, , width, height] = (await svg.getAttribute('viewBox')).split(' ').map(Number);
			for (const [index, option] of Object.entries(expected)) {
				const path = state.page.locator(`[data-match-connection="${index}"]`);
				const points = (await path.getAttribute('d')).match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number);
				const left = await state.page.locator(`[data-match-left="${index}"]`).boundingBox();
				const right = await state.page.locator(`[data-match-right=${JSON.stringify(option)}]`).boundingBox();
				const coordinates = [
					[svgBox.x + points[0] * svgBox.width / width, left.x + left.width],
					[svgBox.y + points[1] * svgBox.height / height, left.y + left.height / 2],
					[svgBox.x + points.at(-2) * svgBox.width / width, right.x],
					[svgBox.y + points.at(-1) * svgBox.height / height, right.y + right.height / 2]
				];
				for (const [actual, target] of coordinates) assert.ok(Math.abs(actual - target) < 1.5, `${index}: ${actual} és ${target}`);
			}
			console.log(`Pontos végpontok: ${Object.keys(expected).length} kapcsolat.`);
			return;
		} catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 25)); }
	}
	throw lastError;
}

await state.page.setViewportSize({ width: 1280, height: 800 });
await mountFixture({ type: 'match' });
await click(button('Párizs'));
await checkConnections({ 1: 'Párizs' });
await click(button('Válaszok újrakeverése'));
await checkConnections({ 1: 'Párizs' });
await click(button('Bécs'));
await click(button('Bal oldal újrakeverése'));
await click(button('Budapest'));
await checkConnections({ 0: 'Budapest', 1: 'Párizs', 2: 'Bécs' });
await state.page.setViewportSize({ width: 320, height: 800 });
await observe();
await checkConnections({ 0: 'Budapest', 1: 'Párizs', 2: 'Bécs' });
await click(button('Magyarország, párja: Budapest'));
await click(button('Párizs, párja: Franciaország'));
await checkConnections({ 0: 'Párizs', 2: 'Bécs' });
await click(button('Budapest'));
await click(button('Ellenőrzés (3/3)'));
assert.deepEqual(JSON.parse(await state.page.locator('[data-answer]').textContent()), ['Párizs', 'Budapest', 'Bécs']);
await checkConnections({ 0: 'Párizs', 1: 'Budapest', 2: 'Bécs' });
await state.page.screenshot({ path: '/tmp/leardy-question-types-mobile.png', scale: 'css' });

await state.page.setViewportSize({ width: 900, height: 800 });
await mountFixture({ type: 'match', inDrawer: true });
for (const name of ['Párizs', 'Bécs', 'Budapest']) await click(button(name));
await checkConnections({ 0: 'Budapest', 1: 'Párizs', 2: 'Bécs' });
await click(button('Válaszok újrakeverése'));
await checkConnections({ 0: 'Budapest', 1: 'Párizs', 2: 'Bécs' });
await state.page.screenshot({ path: '/tmp/leardy-question-types-drawer.png', scale: 'css' });

for (const type of ['choice', 'tf', 'text', 'match', 'order']) {
	await mountFixture({ type, mode: 'editor' });
	if (type === 'choice') {
		await click(state.page.getByRole('radio', { name: '2. lehetőség a helyes válasz', exact: true }));
		await fill(state.page.getByRole('textbox', { name: '2. válaszlehetőség', exact: true }), 'Új válasz');
		await click(button('1. lehetőség törlése'));
	} else if (type === 'tf') await click(state.page.getByRole('radio', { name: 'Hamis', exact: true }).locator('..'));
	else if (type === 'text') await fill(state.page.getByRole('textbox', { name: 'Elfogadott válasz', exact: true }), 'Árvíztűrő');
	else if (type === 'match') await fill(state.page.getByRole('textbox', { name: '1. pár jobb oldala', exact: true }), 'Új város');
	else await click(button('1. elem lejjebb'));
	await click(button('Mentés'));
	const saved = JSON.parse(await state.page.locator('[data-saved]').textContent());
	assert.equal(saved.type, type);
	if (type === 'choice') { assert.equal(saved.correct_answer, 'Új válasz'); assert.equal(saved.options[0], 'Új válasz'); }
	else if (type === 'tf') assert.equal(saved.correct_answer, 'Hamis');
	else if (type === 'text') assert.equal(saved.correct_answer, 'Árvíztűrő');
	else if (type === 'match') assert.equal(saved.pairs[0].right, 'Új város');
	else assert.deepEqual(saved.options, ['Második', 'Első', 'Harmadik']);
	console.log(`Szerkesztő ellenőrizve: ${type}`);
}

await mountFixture({ type: 'match', mode: 'runner' });
const rightOrder = (await state.page.locator('[data-match-right]').allTextContents()).map((text) => text.trim());
for (const [left, right] of [['Magyarország', 'Budapest'], ['Franciaország', 'Párizs'], ['Ausztria', 'Bécs']]) {
	await click(button(left));
	await click(button(right));
	assert.deepEqual((await state.page.locator('[data-match-right]').allTextContents()).map((text) => text.replace(/\d+$/, '').trim()), rightOrder);
}
await checkConnections({ 0: 'Budapest', 1: 'Párizs', 2: 'Bécs' });
await click(button('Ellenőrzés (3/3)'));
await state.page.getByText('100%', { exact: true }).waitFor();
await observe();
console.log('A teljes kvízfutam helyes, a kevert megjelenítés nem módosította a kiértékelést.');
state.questionTypeTestResult = { passed: true, endpoints: ['asztali', 'mobil', 'Drawer', 'újrakeverés', 'újrapárosítás', 'kiértékelés'], editors: ['choice', 'tf', 'text', 'match', 'order'], runnerScore: '100%' };

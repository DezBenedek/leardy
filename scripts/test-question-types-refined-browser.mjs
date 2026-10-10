// Futtatás élő Vite mellett: playwriter -s <munkamenet> -f scripts/test-question-types-refined-browser.mjs --timeout 180000
const assert = require('assert').strict;
state.page = await context.newPage();
await state.page.route('**/__question_types_refined__', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="hu"><head><meta charset="utf-8"><script type="module">import "/src/app.css";</script></head><body></body></html>' }));
await state.page.route('**/__question-map-image__.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560"><rect width="800" height="560" fill="#e0e7ff"/><path d="M150 420L220 150L400 100L660 280L560 460Z" fill="#c7d2fe" stroke="#818cf8" stroke-width="3"/></svg>' }));
await state.page.goto('http://localhost:5173/__question_types_refined__');
console.log(await snapshot({ page: state.page }));
async function observe() {
	const logs = await getLatestLogs({ page: state.page, sinceLastCall: true });
	assert.equal(logs.some((log) => /ResizeObserver loop|effect_update_depth_exceeded|Uncaught|hydration_mismatch|state_unsafe_mutation/.test(log)), false, JSON.stringify(logs));
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
		target.style.cssText = 'position:fixed;inset:0;overflow:auto;background:var(--color-white);padding:16px;';
		document.body.append(target);
		window.__questionTypeTarget = target;
		const { default: Fixture } = await import('/src/lib/question-types/__tests__/QuestionTypes.svelte');
		window.__questionTypeFixture = mount(Fixture, { target, props });
	}, props);
	await observe();
	console.log('Felület:', props);
}
const button = (name) => state.page.getByRole('button', { name, exact: true });
async function click(locator) { await locator.click(); await observe(); }
async function fill(locator, value) { await locator.fill(value); await observe(); }
async function drag(source, target, dx = 0, dy = 0) {
	await source.scrollIntoViewIfNeeded();
	const a = await source.boundingBox();
	const b = target ? await target.boundingBox() : a;
	await state.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
	await state.page.mouse.down();
	await state.page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 });
	await state.page.mouse.up();
	await observe();
}
async function saved() { await click(button('Mentés')); return JSON.parse(await state.page.locator('[data-saved]').textContent()); }
async function checkArrowNow() {
	const canvas = await state.page.locator('[data-map-canvas]').boundingBox();
	const line = state.page.locator('[data-map-arrow="elso"]');
	const edge = state.page.getByRole('button', { name: '1. mező mozgatása', exact: true });
	const rect = await edge.boundingBox();
	const x = canvas.x + Number(await line.getAttribute('x2'));
	const y = canvas.y + Number(await line.getAttribute('y2'));
	const onEdge = Math.min(Math.abs(x - rect.x), Math.abs(x - rect.x - rect.width), Math.abs(y - rect.y), Math.abs(y - rect.y - rect.height));
	assert.ok(onEdge < 3, `Nyílvég a mező szélén: ${onEdge}`);
}
async function checkArrows() {
 let lastError;
 for (let attempt = 0; attempt < 40; attempt++) {
  try { await checkArrowNow(); return; }
  catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 25)); }
 }
 throw lastError;
}
await state.page.setViewportSize({ width: 1000, height: 1000 });
await mountFixture({ type: 'choice', mode: 'editor' });
await click(button('Több jó válasz'));
for (const index of [3]) await click(state.page.getByRole('checkbox', { name: `${index}. lehetőség a helyes válasz`, exact: true }));
await fill(state.page.getByRole('textbox', { name: '1. válaszlehetőség', exact: true }), 'Átírt válasz');
let data = await saved();
assert.equal(data.settings.multiple, true);
assert.deepEqual(JSON.parse(data.correct_answer), ['Átírt válasz', 'Harmadik']);
await click(button('Egy jó válasz'));
data = await saved();
assert.equal(data.correct_answer, 'Átírt válasz');
assert.equal(data.settings.multiple, false);

await mountFixture({ type: 'choice', multiple: true });
await click(button('Első'));
assert.equal(await state.page.locator('[data-answer]').textContent(), '');
await click(button('Harmadik'));
await click(button('Ellenőrzés'));
assert.deepEqual(JSON.parse(await state.page.locator('[data-answer]').textContent()), ['Első', 'Harmadik']);
assert.equal(await button('Első').isDisabled(), true);

for (const type of ['gap', 'map']) {
	for (const inputMode of ['text', 'dropdown', 'drag']) {
		await mountFixture({ type, inputMode });
		const submit = button('Ellenőrzés (0/2)');
		assert.equal(await submit.isDisabled(), true);
		if (inputMode === 'text') {
			for (const [index, answer] of ['Budapest', 'Bécs'].entries()) await fill(state.page.getByRole('textbox', { name: `${index + 1}. hiányzó válasz`, exact: true }), answer);
		} else if (inputMode === 'dropdown') {
			for (const [index, answer] of ['Budapest', 'Bécs'].entries()) { await state.page.getByRole('combobox', { name: `${index + 1}. hiányzó válasz`, exact: true }).selectOption(answer); await observe(); }
		} else {
			await drag(button('Budapest'), button('1. válaszhely'));
			assert.equal(await button('Budapest').count(), 0);
			await click(button('Bécs'));
			await click(button('2. válaszhely'));
			await click(button('1. válaszhely: Budapest'));
			assert.equal(await button('Budapest').count(), 1);
			await click(button('Budapest'));
			await click(button('1. válaszhely'));
		}
		await click(button('Ellenőrzés (2/2)'));
		assert.deepEqual(JSON.parse(await state.page.locator('[data-answer]').textContent()), ['Budapest', 'Bécs']);
	}
	await mountFixture({ type, inputMode: 'drag', reusable: true });
	await click(button('Budapest'));
	await click(button('1. válaszhely'));
	assert.equal(await button('Budapest').count(), 1);
	await click(button('Budapest'));
	await click(button('2. válaszhely'));
	await click(button('Ellenőrzés (2/2)'));
	assert.deepEqual(JSON.parse(await state.page.locator('[data-answer]').textContent()), ['Budapest', 'Budapest']);
}

await mountFixture({ type: 'gap', mode: 'editor', inDrawer: true });
await fill(state.page.getByRole('textbox', { name: 'Hiányos szöveg', exact: true }), 'A [[Duna]] folyó, [[Budapest]] főváros.');
await click(button('Beírós'));
data = await saved();
assert.equal(data.settings.text, 'A [[Duna]] folyó, [[Budapest]] főváros.');
assert.equal(data.settings.mode, 'text');

// A módváltás és az összecsukható részek a képet és a panelt is helyben tartják.
async function layoutFrames(main, region) {
	const frames = [];
	const until = Date.now() + 650;
	do {
		frames.push({ main: await main.boundingBox(), panel: await state.page.getByRole('dialog').boundingBox(), region: region ? await region.boundingBox() : null });
		await new Promise((resolve) => setTimeout(resolve, 12));
	} while (Date.now() < until);
	return frames;
}
function stableFrames(baseline, frames) {
	for (const frame of frames) {
		for (const key of ['x', 'width', 'height']) {
			assert.ok(Math.abs(frame.main[key] - baseline.main[key]) < 1, `A tartalom helyben marad (${key})`);
		}
		assert.ok(Math.abs((frame.main.y - frame.panel.y) - (baseline.main.y - baseline.panel.y)) < 1, 'A kép helye a panelen belül állandó');
		assert.ok(Math.abs(frame.panel.width - baseline.panel.width) < 1, 'A panel szélessége állandó');
	}
}
async function fittedPanel() {
	const panel = await state.page.getByRole('dialog').boundingBox();
	const content = await state.page.locator('[data-overlay-scroller] > div').boundingBox();
	const grip = await state.page.getByRole('dialog').locator('.cursor-grab').boundingBox();
	assert.ok(panel.height <= content.height + (grip?.height ?? 0) + 3, `A panel csak a tartalmának megfelelő magas: ${panel.height}/${content.height}`);
}
async function animatedDisclosure(main, name, open) {
	const toggle = button(name);
	const region = state.page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`);
	const before = (await layoutFrames(main, region)).at(-1);
	await click(toggle);
	const frames = await layoutFrames(main, region);
	stableFrames(before, frames);
	const end = frames.at(-1).region?.height ?? 0;
	const start = before.region?.height ?? 0;
	assert.ok(open ? end > start + 20 : start > end + 20, `${name}: változik a magasság`);
	assert.ok(frames.some((frame) => {
		const height = frame.region?.height ?? 0;
		return height > Math.min(start, end) + 1 && height < Math.max(start, end) - 1;
	}), `${name}: köztes animációs állapot`);
	assert.equal(await toggle.getAttribute('aria-expanded'), String(open));
	await fittedPanel();
}
for (const viewport of [{ width: 1000, height: 1400 }, { width: 375, height: 1000 }]) {
	await state.page.setViewportSize(viewport);
	for (const type of ['map', 'gap']) {
		await mountFixture({ type, mode: 'editor', inDrawer: true });
		const main = type === 'map' ? state.page.locator('[data-map-canvas]') : state.page.getByRole('textbox', { name: 'Hiányos szöveg', exact: true });
		const before = (await layoutFrames(main)).at(-1);
		await fittedPanel();
		for (const mode of ['Beírós', 'Lenyílós', 'Behúzós']) {
			await click(button(mode));
			stableFrames(before, await layoutFrames(main));
			await fittedPanel();
		}
		if (viewport.width === 1000) {
			if (type === 'map') {
				await animatedDisclosure(main, 'Mező beállításai', true);
				await animatedDisclosure(main, 'Mező beállításai', false);
			}
			await animatedDisclosure(main, 'További válaszok', true);
			await click(button('Válasz hozzáadása'));
			await fill(state.page.getByRole('textbox', { name: '1. további lehetőség', exact: true }), 'További szó');
			await animatedDisclosure(main, 'További válaszok', false);
			await click(button('Beírós'));
			await click(button('Behúzós'));
			await animatedDisclosure(main, 'További válaszok', true);
			assert.equal(await state.page.getByRole('textbox', { name: '1. további lehetőség', exact: true }).inputValue(), 'További szó');
		}
	}
}
await state.page.setViewportSize({ width: 1000, height: 1000 });

await state.page.route('**/__question-map-image__.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560"><rect width="400" height="560" fill="black"/><rect x="400" width="400" height="560" fill="white"/></svg>' }));
await mountFixture({ type: 'map', mode: 'editor', inDrawer: true });
await state.page.locator('[data-map-canvas] svg[style*="normal"]').waitFor();
assert.equal(await state.page.locator('[data-map-canvas] linearGradient stop').first().getAttribute('stop-color'), '#fff');
const arrowHandle = button('1. nyílpont mozgatása');
for (let index = 0; index < 10; index++) { await arrowHandle.press('Shift+ArrowRight'); await observe(); }
assert.equal(await state.page.locator('[data-map-canvas] linearGradient stop').first().getAttribute('stop-color'), '#000');
assert.equal(await state.page.locator('[data-map-canvas] linearGradient stop').last().getAttribute('stop-color'), '#fff');

await mountFixture({ type: 'map', mode: 'editor', inDrawer: true });
await checkArrows();
await fill(state.page.getByRole('textbox', { name: 'Helyes válasz', exact: true }), 'Új válasz');
await drag(button('1. mező mozgatása'), null, 30, 25);
await checkArrows();
await drag(button('1. nyílpont mozgatása'), null, -35, 20);
await checkArrows();
await state.page.setViewportSize({ width: 375, height: 1000 });
await observe();
await checkArrows();
await click(button('Mező hozzáadása'));
await fill(state.page.getByRole('textbox', { name: 'Helyes válasz', exact: true }), 'Harmadik válasz');
await click(button('Mező beállításai'));
await click(state.page.getByRole('checkbox', { name: 'Nyíl bekapcsolása', exact: true }));
await click(button('Lenyílós'));
data = await saved();
assert.equal(data.settings.boxes.length, 3);
assert.equal(data.settings.boxes[0].answer, 'Új válasz');
assert.ok(data.settings.boxes[0].x > 25);
assert.ok(data.settings.boxes[0].arrow.x < 40);
assert.ok(data.settings.boxes[2].arrow);
assert.equal(data.settings.mode, 'dropdown');
await state.page.screenshot({ path: '/tmp/leardy-map-editor-mobile.png', scale: 'css' });

for (const props of [{ type: 'choice', multiple: true }, { type: 'gap', inputMode: 'text' }, { type: 'map', inputMode: 'dropdown' }]) {
	await mountFixture({ ...props, mode: 'runner' });
	if (props.type === 'choice') { await click(button('Első')); await click(button('Harmadik')); await click(button('Ellenőrzés')); }
	else {
		for (const [index, answer] of ['Budapest', 'Bécs'].entries()) {
			const field = state.page.getByRole(props.inputMode === 'text' ? 'textbox' : 'combobox', { name: `${index + 1}. hiányzó válasz`, exact: true });
			if (props.inputMode === 'text') await fill(field, answer); else { await field.selectOption(answer); await observe(); }
		}
		await click(button('Ellenőrzés (2/2)'));
	}
	await state.page.getByText('100%', { exact: true }).waitFor();
	await observe();
}
await state.page.setViewportSize({ width: 1000, height: 1000 });
await mountFixture({ type: 'map', mode: 'core' });
await click(button('1. kérdés szerkesztése: Tesztkérdés'));
await fill(state.page.getByRole('textbox', { name: 'Helyes válasz', exact: true }), 'Új főváros');
data = await saved();
assert.equal(data.settings.boxes[0].answer, 'Új főváros');
await click(button('1. kérdés szerkesztése: Tesztkérdés'));
assert.equal(await state.page.getByRole('textbox', { name: 'Helyes válasz', exact: true }).inputValue(), 'Új főváros');
const template = { ...data, key: 'sajat', title: 'Vaktérképsablon', subtitle: '', createdAt: 1, settings: { ...data.settings, boxes: data.settings.boxes.map((box, index) => ({ ...box, answer: index === 0 ? 'Sablonválasz' : box.answer })) } };
await state.page.route('**/api/quiz-templates', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ templates: [template] }) }));
await click(button('Kérdés további műveletei'));
await click(button('Saját sablon betöltése'));
await click(button('Vaktérképsablon Vaktérkép'));
await observe();
assert.equal(await state.page.getByRole('textbox', { name: 'Helyes válasz', exact: true }).inputValue(), 'Sablonválasz');
data = await saved();
assert.equal(data.settings.boxes[0].answer, 'Sablonválasz');
await click(button('Kérdés hozzáadása'));
const typeSheet = state.page.getByRole('dialog', { name: 'Kérdéstípus', exact: true });
for (const name of ['Feleletválasztós', 'Igaz, hamis', 'Rövid válasz (beírós)', 'Hiányos szöveg', 'Összekötős', 'Sorrend', 'Vaktérkép']) assert.equal(await typeSheet.getByRole('button', { name, exact: true }).count(), 1);
await click(typeSheet.getByRole('button', { name: /^Hiányos szöveg/ }));
await fill(state.page.getByRole('textbox', { name: 'Kérdés', exact: true }), 'Egészítsd ki!');
await fill(state.page.getByRole('textbox', { name: 'Hiányos szöveg', exact: true }), 'A Duna folyó.');
await state.page.getByRole('textbox', { name: 'Hiányos szöveg', exact: true }).evaluate((node) => { node.focus(); node.setSelectionRange(2, 6); });
await click(button('Kihagyás jelölése'));
assert.equal(await state.page.getByRole('textbox', { name: 'Hiányos szöveg', exact: true }).inputValue(), 'A [[Duna]] folyó.');
data = await saved();
assert.equal(data.settings.text, 'A [[Duna]] folyó.');
await click(button('Kérdés hozzáadása'));
await click(state.page.getByRole('dialog', { name: 'Kérdéstípus', exact: true }).getByRole('button', { name: 'Igaz, hamis', exact: true }));
await new Promise((resolve) => setTimeout(resolve, 350));
assert.ok((await state.page.getByRole('dialog', { name: 'Kérdés szerkesztése', exact: true }).boundingBox()).height < 600, 'Rövid kérdéshez alacsony panel');
const menuToggle = button('Kérdés további műveletei');
const menuShell = state.page.locator(`[id="${await menuToggle.getAttribute('aria-controls')}"]`).locator('..');
for (const open of [true, false]) {
	await click(menuToggle);
	const frames = [];
	const until = Date.now() + 380;
	do {
		frames.push(await menuShell.evaluate((node) => { const css = getComputedStyle(node); return { opacity: Number(css.opacity), clip: css.clipPath }; }));
		await new Promise((resolve) => setTimeout(resolve, 12));
	} while (Date.now() < until);
	assert.ok(frames.some((frame) => frame.opacity > 0 && frame.opacity < 1), 'A műveleti menü áttűnik');
	assert.ok(new Set(frames.map((frame) => frame.clip)).size > 1, 'A műveleti menü fokozatosan nyílik és csukódik');
	assert.equal(await menuToggle.getAttribute('aria-expanded'), String(open));
}
state.refinedQuestionTypeTestResult = { passed: true, modes: ['drag', 'text', 'dropdown'], editors: ['choice', 'gap', 'map'], map: ['mezőmozgatás', 'nyílpont', 'automatikus nyílvég', 'automatikus nyílszín', 'mobil', 'Drawer'], layout: ['tartalomhoz igazodó panel', 'lenyílás', 'összecsukódás', 'értékmegőrzés', 'animált műveleti menü'], runnerScore: '100%' };
console.log(state.refinedQuestionTypeTestResult);

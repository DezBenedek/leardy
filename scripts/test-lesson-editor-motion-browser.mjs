// Az alap böngészős teszt után, ugyanabban a munkamenetben futtatható.
const assert = require('assert').strict;
const page = state.page;
const button = (name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
const section = (index) => page.locator('[data-lesson-section]').nth(index);
const active = () => page.locator('.rich-editor.expanded [role="textbox"]');
const lesson = {
	id: `lesson-motion-${Date.now()}`, title: 'Animációs tesztlecke', levelId: 'test-level', subjectId: 'mathematics', levelTitle: 'Szint', materialTitle: 'Témakör', body_md: '', contentRevision: 0,
	content: { version: 1, sections: [36, 12, 24].map((lines, index) => ({ slug: `motion-${index}`, title: `Bekezdés ${index + 1}`, doc: { type: 'doc', content: Array.from({ length: lines }, (_, row) => ({ type: 'paragraph', content: [{ type: 'text', text: `Sor ${index + 1}/${row + 1}` }] })) } })) }
};
async function mount(width, suffix = '') {
	await page.setViewportSize({ width, height: 844 });
	await page.goto(`${state.lessonOrigin}/__lesson_editor_test__`);
	await page.evaluate(async (lesson) => {
		const { mountLesson } = await import('/src/lib/components/lesson/__tests__/lesson-editor-fixture.ts');
		await mountLesson(lesson);
	}, { ...lesson, id: `${lesson.id}-${width}-${suffix}` });
	await page.waitForFunction(() => document.querySelector('[aria-label="Bekezdés tartalma"]')?.getAttribute('contenteditable') === 'true');
	await settle();
}
async function settle() {
	await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 650)));
}
async function record() {
	await page.evaluate(() => {
		const start = performance.now();
		window.motionFrames = [];
		window.motionRecording = new Promise((resolve) => {
			function sample() {
				window.motionFrames.push({
					time: performance.now() - start, scroll: window.scrollY,
					cards: [...document.querySelectorAll('[data-lesson-section]')].map((node) => ({
						title: node.querySelector('input')?.value,
						height: node.parentElement.getBoundingClientRect().height,
						document: node.querySelector('.document-viewport').getBoundingClientRect().height,
						top: node.querySelector('[role="textbox"]').getBoundingClientRect().top
					}))
				});
				if (performance.now() - start < 650) requestAnimationFrame(() => setTimeout(sample, 0));
				else resolve(window.motionFrames);
			}
			requestAnimationFrame(() => setTimeout(sample, 0));
		});
	});
}
async function frames() { return page.evaluate(() => window.motionRecording); }
function intermediate(values, from, to, message) {
	const lower = Math.min(from, to) + 2;
	const upper = Math.max(from, to) - 2;
	assert.ok(values.filter((value) => value > lower && value < upper).length >= 3, message);
}
for (const width of [1100, 390]) {
	await mount(width);
	const second = section(1).getByRole('textbox', { name: 'Bekezdés tartalma' });
	await second.evaluate((node) => window.scrollBy({ top: node.getBoundingClientRect().top - 300, behavior: 'instant' }));
	await record();
	await second.locator('p').first().click({ position: { x: 80, y: 12 } });
	const switching = await frames();
	intermediate(switching.map((frame) => frame.cards[0].document), 864, 96, `A korábbi bekezdés magassága folyamatosan csökkenjen (${width}).`);
	intermediate(switching.map((frame) => frame.cards[1].document), 96, 288, `A megnyitott bekezdés magassága folyamatosan nőjön (${width}).`);
	const moving = switching.filter((frame) => frame.cards[0].document < 862);
	assert.ok(Math.max(...moving.map((frame) => Math.abs(frame.cards[1].top - switching[0].cards[1].top))) <= 3, `A kattintott szöveg helye végig maradjon stabil (${width}).`);
	assert.equal(await page.locator('.rich-editor.expanded').count(), 1);
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');
	await page.keyboard.type('Azonnali gépelés');
	assert.ok((await active().innerText()).includes('Azonnali gépelés'));
	await button('Bekezdés műveletei: Bekezdés 3').click();
	await record();
	await page.locator('.dropdown-shell.icons-only[data-open="true"]').getByRole('button', { name: 'Törlés', exact: true }).click();
	const deleting = await frames();
	const removedHeights = deleting.map((frame) => frame.cards.find((card) => card.title === 'Bekezdés 3')?.height ?? 0);
	intermediate(removedHeights, removedHeights[0], 0, `A törölt bekezdés csukódjon össze (${width}).`);
	assert.equal(await section(0).count(), 1);
	assert.equal(await page.locator('[data-lesson-section]').count(), 2);
	await record();
	await button('Bekezdés hozzáadása').click();
	await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Bekezdés tartalma');
	await page.keyboard.type('Új bekezdés azonnal');
	const adding = await frames();
	const addedHeights = adding.map((frame) => frame.cards.find((card) => card.title === 'Új bekezdés')?.height ?? 0);
	intermediate(addedHeights, 0, addedHeights.at(-1), `Az új bekezdés fokozatosan nyíljon ki (${width}).`);
	assert.equal(await active().innerText(), 'Új bekezdés azonnal');
	await button('Bekezdés műveletei: Új bekezdés').click();
	await page.locator('.dropdown-shell.icons-only[data-open="true"]').getByRole('button', { name: 'Törlés', exact: true }).click();
	await settle();
	assert.equal(await page.locator('.rich-editor.expanded').count(), 1);
	for (const index of [0, 1, 0, 1]) {
		await section(index).getByRole('textbox', { name: 'Bekezdés címe' }).evaluate((node) => node.click());
	}
	await settle();
	assert.equal(await page.locator('.rich-editor.expanded').count(), 1);
	assert.equal(await active().locator('p').first().innerText(), 'Sor 2/1');
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	for (const title of ['Bekezdés 1', 'Bekezdés 2']) {
		await button(`Bekezdés műveletei: ${title}`).click();
		await page.locator('.dropdown-shell.icons-only[data-open="true"]').getByRole('button', { name: 'Törlés', exact: true }).click();
		await settle();
	}
	assert.equal(await page.locator('[data-lesson-section]').count(), 0);
	await page.getByText('Még nincs bekezdés. Adj hozzá egyet a lecke megírásához.', { exact: true }).waitFor();
	assert.equal(await button('Bekezdés hozzáadása').evaluate((node) => document.activeElement === node), true);
	await button('Bekezdés hozzáadása').click();
	await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Bekezdés tartalma');
	await page.keyboard.type('Újrakezdés az üres leckében');
	assert.equal(await active().innerText(), 'Újrakezdés az üres leckében');
	await button('Bekezdés hozzáadása').click();
	const newTitle = section(1).getByRole('textbox', { name: 'Bekezdés címe' });
	await newTitle.evaluate((node) => {
		node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		node.focus({ preventScroll: true });
		node.click();
	});
	await settle();
	assert.equal(await newTitle.evaluate((node) => document.activeElement === node), true, 'A cím szerkesztését ne szakítsa meg késői automatikus fókusz.');
}
for (const preference of ['system', 'app']) {
	await page.emulateMedia({ reducedMotion: preference === 'system' ? 'reduce' : 'no-preference' });
	await mount(390, preference);
	if (preference === 'app') await page.evaluate(() => document.documentElement.classList.add('reduce-motion'));
	await section(1).getByRole('textbox', { name: 'Bekezdés címe' }).evaluate((node) => node.click());
	assert.equal(await section(1).locator('.document-viewport').evaluate((node) => getComputedStyle(node).transitionDuration), '0s');
	assert.equal(await section(1).locator('.toolbar-reveal').evaluate((node) => getComputedStyle(node).transitionDuration), '0s');
}
await page.emulateMedia({ reducedMotion: 'no-preference' });
await page.evaluate(() => document.documentElement.classList.remove('reduce-motion'));
assert.equal(state.lessonErrors.length, 0, state.lessonErrors.join('\n'));
console.log('PASS: folyamatos nyitás és összecsukás, stabil szövegpozíció, animált törlés és hozzáadás, azonnali gépelés, gyors váltás és mindkét mozgáscsökkentési beállítás asztali és mobilnézetben.');

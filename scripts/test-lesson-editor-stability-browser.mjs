// Az alap böngészős teszt után, ugyanabban a munkamenetben futtatható.
const assert = require('assert').strict;
const page = state.page;
await page.goto(`${state.lessonOrigin}/__lesson_editor_test__`);
const lesson = {
	id: `lesson-stable-${Date.now()}`, title: 'Stabil szerkesztő', levelId: 'test-level', subjectId: 'mathematics', levelTitle: 'Szint', materialTitle: 'Témakör', body_md: '', contentRevision: 0,
	content: { version: 1, sections: [40, 8, 40].map((lines, index) => ({ slug: `s${index}`, title: `Bekezdés ${index + 1}`, doc: { type: 'doc', content: Array.from({ length: lines }, (_, row) => ({ type: 'paragraph', content: [{ type: 'text', text: `Sor ${index + 1}/${row + 1}` }] })) } })) }
};
const button = (name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
const active = () => page.locator('.rich-editor.expanded [role="textbox"]');
for (const width of [1100, 390]) {
	await page.setViewportSize({ width, height: 844 });
	await page.evaluate(async (lesson) => { const { mountLesson } = await import('/src/lib/components/lesson/__tests__/lesson-editor-fixture.ts'); await mountLesson(lesson); }, { ...lesson, id: `${lesson.id}-${width}` });
	await page.waitForFunction(() => document.querySelector('[aria-label="Bekezdés tartalma"]')?.getAttribute('contenteditable') === 'true');
	assert.equal(await page.locator('.rich-editor.expanded').count(), 1);
	assert.equal(await active().locator('p').count(), 40);
	const second = page.getByRole('textbox', { name: 'Bekezdés tartalma', exact: true }).nth(1);
	await second.evaluate((node) => { window.scrollBy({ top: node.getBoundingClientRect().top - 300, behavior: 'instant' }); });
	const before = await second.boundingBox();
	await second.locator('p').nth(1).click({ position: { x: 200, y: 12 } });
	const after = await second.boundingBox();
	assert.ok(Math.abs(after.y - before.y) <= 2, `A kattintott mező elmozdult (${width}px): ${before.y} -> ${after.y}`);
	await page.keyboard.press('Enter');
	await page.keyboard.type('Azonnali új sor');
	assert.equal((await active().locator('p').allTextContents()).slice(0, 4).join('|'), 'Sor 2/1|Sor 2/2|Azonnali új sor|Sor 2/3');
	const firstTitle = page.getByRole('textbox', { name: 'Bekezdés címe', exact: true }).first();
	await firstTitle.click();
	assert.equal(await active().locator('p').count(), 40);
	await button('Bekezdés hozzáadása').click();
	await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Bekezdés tartalma');
	await page.keyboard.type('Új bekezdés egy kattintással');
	assert.equal(await active().innerText(), 'Új bekezdés egy kattintással');
	assert.equal(await page.getByRole('textbox', { name: 'Bekezdés tartalma' }).count(), 4);
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}
console.log('PASS: alapból nyitott első bekezdés, változatlan kattintási hely, azonnali Enter és gépelés, hosszú mezőből egykattintásos hozzáadás asztali és mobilnézetben.');

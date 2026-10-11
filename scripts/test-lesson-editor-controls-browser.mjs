// Az alap böngészős teszt után, ugyanabban a munkamenetben futtatható.
const assert = require('assert').strict;
const page = state.page;
await page.goto(`${state.lessonOrigin}/__lesson_editor_test__`);
await page.setViewportSize({ width: 1100, height: 900 });
const paragraph = (text, marks = []) => ({ type: 'paragraph', content: [{ type: 'text', text, marks }] });
const cell = (text, header = false) => ({ type: header ? 'tableHeader' : 'tableCell', content: [paragraph(text)] });
const lesson = {
	id: `lesson-controls-${Date.now()}`, title: 'Szerkesztő vezérlők', levelId: 'test-level', subjectId: 'mathematics', levelTitle: 'Szint', materialTitle: 'Témakör', body_md: '', contentRevision: 0,
	content: { version: 1, sections: [{ slug: 'vezerlok', title: 'Vezérlők', intro: false, doc: { type: 'doc', content: [
		paragraph('Kijelölhető szöveg'),
		...['underline', 'strike', 'highlight', 'subscript', 'superscript', 'code'].map((type) => paragraph(`Formázás: ${type}`, [{ type }])),
		{ type: 'orderedList', content: [{ type: 'listItem', content: [paragraph('Számozott elem')] }] },
		{ type: 'blockquote', content: [paragraph('Idézett szöveg')] },
		{ type: 'table', content: [{ type: 'tableRow', content: [cell('Bal fejléc', true), cell('Jobb fejléc', true)] }, { type: 'tableRow', content: [cell('Bal cella'), cell('Jobb cella')] }] },
		...Array.from({ length: 50 }, (_, i) => paragraph(`Hosszú bekezdés ${i + 1}. sora.`))
	] } }] }
};
await page.evaluate(async (lesson) => { const { mountLesson } = await import('/src/lib/components/lesson/__tests__/lesson-editor-fixture.ts'); await mountLesson(lesson); }, lesson);
const active = () => page.locator('.rich-editor.expanded [role="textbox"]');
const button = (name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
await active().waitFor();
await page.waitForFunction(() => document.querySelector('.rich-editor.expanded [role="textbox"]')?.getAttribute('contenteditable') === 'true');
const select = async (locator, all = false) => {
	await locator.evaluate((node, all) => {
		node.closest('[contenteditable]').focus({ preventScroll: true });
		const range = document.createRange(); range.selectNodeContents(node);
		if (!all) range.collapse(false);
		const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
	}, all);
	await page.evaluate(() => new Promise(requestAnimationFrame));
};
await select(active().locator('p').first(), true);
await button('További formázások').click();
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'textbox');
assert.equal(await page.evaluate(() => getSelection().toString()), 'Kijelölhető szöveg');
await button('Aláhúzás').click();
assert.equal(await active().locator('p').first().locator('u').innerText(), 'Kijelölhető szöveg');
assert.equal(await page.evaluate(() => getSelection().toString()), 'Kijelölhető szöveg');
assert.equal(await button('További formázások').getAttribute('aria-expanded'), 'true');
assert.equal(await button('Aláhúzás').getAttribute('aria-pressed'), 'true');
await button('Aláhúzás').click();
assert.equal(await button('További formázások').getAttribute('aria-expanded'), 'true');
assert.equal(await button('Aláhúzás').getAttribute('aria-pressed'), 'false');
assert.equal(await active().locator('p').first().locator('u').count(), 0);
await button('Kiemelés').click();
assert.equal(await button('További formázások').getAttribute('aria-expanded'), 'true');
assert.equal(await button('Kiemelés').getAttribute('aria-pressed'), 'true');
await button('Kiemelés').click();
await button('További formázások').click();
assert.equal(await button('További formázások').getAttribute('aria-expanded'), 'false');
await button('További formázások').click();
await page.getByRole('heading', { name: 'Bekezdések', exact: true }).click();
assert.equal(await button('További formázások').getAttribute('aria-expanded'), 'false');
for (const [text, name] of [['Formázás: underline', 'Aláhúzás'], ['Formázás: strike', 'Áthúzás'], ['Formázás: highlight', 'Kiemelés'], ['Formázás: subscript', 'Alsó index'], ['Formázás: superscript', 'Felső index'], ['Formázás: code', 'Szövegközi kód'], ['Számozott elem', 'Számozott lista'], ['Idézett szöveg', 'Idézet']]) {
	await select(active().getByText(text, { exact: true }), true);
	await button('További formázások').click();
	assert.equal(await button(name).getAttribute('aria-pressed'), 'true', name);
	await page.keyboard.press('Escape');
}
await select(active().locator('p').last());
await button('További formázások').focus();
await page.keyboard.press('Enter');
await active().locator('.editor-retained-caret').waitFor();
assert.equal(await button('Aláhúzás').getAttribute('aria-pressed'), 'false');
assert.equal(await button('Kiemelés').getAttribute('aria-pressed'), 'false');
await page.keyboard.press('Escape');
await select(active().locator('p').first(), true);
await button('További formázások').focus();
await page.keyboard.press('Enter');
await active().locator('.editor-retained-selection').waitFor();
assert.equal(await active().locator('.editor-retained-selection').innerText(), 'Kijelölhető szöveg');
await page.keyboard.press('Escape');
await active().locator('table td').nth(1).click();
await button('Táblázat').click();
const menu = page.getByRole('dialog', { name: 'Táblázat műveletei', exact: true });
await menu.getByText('2. sor · 2. oszlop', { exact: true }).waitFor();
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'textbox');
assert.equal(await button('Fejléc be- vagy kikapcsolása').getAttribute('aria-pressed'), 'true');
const box = await menu.boundingBox();
const tableButton = await button('Táblázat').boundingBox();
assert.ok(box.width <= 210 && box.height <= 180);
assert.ok(Math.abs(box.y - tableButton.y - tableButton.height - 6) <= 1, 'A táblázatmenü a gomb alatt nyíljon meg.');
await button('Sor hozzáadása alul').click();
assert.equal(await active().locator('table tr').count(), 3);
assert.equal((await active().locator('table tr').nth(1).locator('td').allTextContents()).join('|'), 'Bal cella|Jobb cella');
assert.equal((await active().locator('table tr').nth(2).innerText()).trim(), '');
await active().locator('table td').nth(1).click();
await button('Táblázat').focus();
await page.keyboard.press('Enter');
await active().locator('.editor-retained-caret').waitFor();
await button('Oszlop hozzáadása balra').click();
assert.equal(await active().locator('table tr').first().locator('th,td').count(), 3);
assert.equal(await active().locator('table tr').nth(1).locator('td').nth(2).textContent(), 'Jobb cella');
const fromCell = await active().locator('table tr').nth(1).locator('td').first().boundingBox();
const toCell = await active().locator('table tr').nth(2).locator('td').nth(1).boundingBox();
await page.mouse.move(fromCell.x + fromCell.width / 2, fromCell.y + fromCell.height / 2);
await page.mouse.down();
await page.mouse.move(toCell.x + toCell.width / 2, toCell.y + toCell.height / 2, { steps: 8 });
await page.mouse.up();
assert.equal(await active().locator('.selectedCell').count(), 4);
await button('Táblázat').focus();
await page.keyboard.press('Enter');
assert.equal(await active().locator('.selectedCell').count(), 4);
await button('Sor törlése').click();
assert.equal(await active().locator('table tr').count(), 1, 'Mindkét kijelölt sor törlődjön.');
await button('Mentés').click();
await page.getByText('Minden módosítás mentve', { exact: true }).waitFor();
assert.ok(!JSON.stringify(state.savedLesson.content).includes('editor-retained'));
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => { const toolbar = document.querySelector('.rich-editor.expanded .toolbar-reveal'); window.scrollTo({ top: scrollY + toolbar.getBoundingClientRect().top + 220, behavior: 'instant' }); });
await page.evaluate(() => new Promise(requestAnimationFrame));
const toolbar = await page.locator('.rich-editor.expanded .toolbar-reveal').boundingBox();
assert.ok(toolbar.y >= -1 && toolbar.y <= 2, `A mobil eszköztár nincs rögzítve: ${toolbar.y}`);
const scrollBefore = await page.evaluate(() => scrollY);
await button('További formázások').click();
assert.ok(Math.abs(await page.evaluate(() => scrollY) - scrollBefore) <= 2);
await button('Aláhúzás').waitFor();
await page.keyboard.press('Escape');
await active().locator('table th').first().click();
await button('Táblázat').click();
const mobileMenu = await menu.boundingBox();
const mobileTrigger = await button('Táblázat').boundingBox();
assert.ok(mobileMenu.width <= 210 && mobileMenu.height <= 200);
assert.ok(Math.abs(mobileMenu.y - mobileTrigger.y - mobileTrigger.height - 6) <= 1, 'Mobilon is a gomb alatt nyíljon meg.');
await page.keyboard.press('Escape');
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await page.screenshot({ path: '/tmp/leardy-editor-sticky-mobile.png', scale: 'css' });
assert.equal(state.lessonErrors.length, 0, state.lessonErrors.join('\n'));
console.log('PASS: kijelölés és kurzor megőrzése egérrel és billentyűzettel, minden további formázás aktív állapota, a gomb alatt nyíló kompakt táblázatmenü asztali és mobilnézetben, helyes sor- és oszlopbeszúrás, többcellás kijelölés megtartása, mobilon rögzített eszköztár, tiszta mentett tartalom.');

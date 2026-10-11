// Futtatás: playwriter -s <saját munkamenet> -f scripts/test-lesson-editor-warnings-browser.mjs --timeout 60000
const assert = require('assert').strict;
const page = state.page = await context.newPage();
page.setDefaultTimeout(5000);
const warnings = [];
page.on('pageerror', (error) => warnings.push(error.message));
page.on('console', (message) => {
	if (/binding_property_non_reactive|Blocked aria-hidden/.test(message.text())) warnings.push(message.text());
});
await page.addInitScript(() => {
	window.hiddenFocusWarnings = [];
	const setAttribute = Element.prototype.setAttribute;
	Element.prototype.setAttribute = function (name, value) {
		if (name === 'aria-hidden' && value === 'true' && this.contains(document.activeElement)) {
			window.hiddenFocusWarnings.push(this.outerHTML);
		}
		return setAttribute.call(this, name, value);
	};
});
await page.route('**/__lesson_editor_warnings_test__', (route) => route.fulfill({
	contentType: 'text/html',
	body: '<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">import "/src/app.css";</script></head><body style="padding:16px"></body></html>'
}));
await page.goto(`${state.lessonOrigin ?? 'http://127.0.0.1:5187'}/__lesson_editor_warnings_test__`);
const lesson = {
	id: `lesson-warnings-${Date.now()}`, title: 'Figyelmeztetések ellenőrzése', levelId: 'test-level', subjectId: 'mathematics', levelTitle: 'Szint', materialTitle: 'Témakör', body_md: '', contentRevision: 0,
	content: { version: 1, sections: [1, 2, 3].map((index) => ({
		slug: `s${index}`, title: `Bekezdés ${index}`, intro: false,
		doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Tartalom ${index}` }] }] }
	})) }
};
const button = (name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
const menu = () => page.locator('.dropdown-shell[data-open="true"]');
const keyboardOpen = async (trigger) => { await trigger.focus(); await page.keyboard.press('Enter'); };
const assertClosed = async () => {
	await page.waitForFunction(() => !document.querySelector('.dropdown-shell[data-open="true"]'));
	assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[aria-hidden="true"], [inert]')), false);
};
for (const width of [1100, 390]) {
	await page.setViewportSize({ width, height: 844 });
	await page.evaluate(async (lesson) => {
		const { mountLesson } = await import('/src/lib/components/lesson/__tests__/lesson-editor-fixture.ts');
		await mountLesson(lesson);
	}, { ...lesson, id: `${lesson.id}-${width}` });
	await page.waitForFunction(() => document.querySelector('[aria-label="Bekezdés tartalma"]')?.getAttribute('contenteditable') === 'true');
	// Széles nézetben a fejléc műveletei külön gombként jelennek meg.
	if (width < 460) {
		const header = button('Lecke műveletei');
		await keyboardOpen(header);
		await menu().getByRole('button', { name: 'Átnevezés', exact: true }).focus();
		await page.keyboard.press('Escape');
		await assertClosed();
		assert.equal(await header.evaluate((node) => node === document.activeElement), true);

		await keyboardOpen(header);
		await menu().getByRole('button', { name: 'Átnevezés', exact: true }).focus();
		await page.locator('h1').click();
		await assertClosed();

		await keyboardOpen(header);
		await menu().getByRole('button', { name: 'Átnevezés', exact: true }).press('Enter');
		await assertClosed();
		await button('Bezárás').click();
	}

	const sectionMenu = button('Bekezdés műveletei: Bekezdés 1');
	await keyboardOpen(sectionMenu);
	await page.keyboard.press('Escape');
	await assertClosed();
	assert.equal(await sectionMenu.evaluate((node) => node === document.activeElement), true);
	await keyboardOpen(sectionMenu);
	await menu().getByRole('button', { name: 'Le', exact: true }).press('Enter');
	await assertClosed();
	assert.equal(await page.getByRole('textbox', { name: 'Bekezdés címe', exact: true }).evaluateAll((nodes) => nodes.map((node) => node.value).join('|')), 'Bekezdés 2|Bekezdés 1|Bekezdés 3');

	await keyboardOpen(sectionMenu);
	await page.keyboard.press('Tab');
	await assertClosed();

	const editor = page.locator('.rich-editor.expanded [role="textbox"]');
	await editor.click();
	await button('Szövegstílus').click();
	assert.equal(await editor.evaluate((node) => node === document.activeElement), true);
	await menu().getByRole('button', { name: 'Normál szöveg', exact: true }).click();
	await assertClosed();
	assert.equal(await editor.evaluate((node) => node === document.activeElement), true);
	await keyboardOpen(button('Szövegstílus'));
	await menu().getByRole('button', { name: 'Normál szöveg', exact: true }).press('Enter');
	await assertClosed();
	await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'textbox');

	await button('Bekezdés hozzáadása').click();
	await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Bekezdés tartalma');
	await page.keyboard.type('Új bekezdés');
	assert.equal(await page.locator('.rich-editor.expanded [role="textbox"]').innerText(), 'Új bekezdés');
	await button('Bekezdés műveletei: Új bekezdés').click();
	await menu().getByRole('button', { name: 'Törlés', exact: true }).click();
	await page.waitForFunction(() => document.querySelectorAll('[data-lesson-section]').length === 3);
}
assert.equal(await page.evaluate(() => window.hiddenFocusWarnings.length), 0);
assert.equal(warnings.length, 0, warnings.join('\n'));
console.log('PASS: nincs nem reaktív kötés vagy fókuszált elem elrejtése; működik a menü kiválasztása, az Escape, a külső kattintás, a Tab, a szerkesztő fókuszának megőrzése, az átrendezés, a hozzáadás és a törlés asztali és mobilnézetben.');

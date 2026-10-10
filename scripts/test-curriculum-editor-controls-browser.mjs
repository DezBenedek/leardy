// Az alap böngészős teszt után, ugyanabban a munkamenetben futtatható.
const assert = require('assert').strict;
const page = state.page;
await page.goto(`${state.lessonOrigin}/__lesson_editor_test__`);
const data = {
	subjects: [{ id: 'subject-test', title: 'Történelem', icon: 'book-open', sort: 0, levelCount: 1, lessonCount: 6, packCount: 0, levelLabel: 'Tananyag' }], subjectId: 'subject-test', levelId: 'level-test', canCreate: true,
	levels: [{ id: 'level-test', title: 'Teszt tananyag', sort: 0, canEdit: true, published: false, ownerId: 'teacher', ownerEmail: 'test@example.invalid', editors: [], materials: [1, 2, 3].map((n) => ({ id: `topic-${n}`, title: `Témakör ${n}`, sort: n, lessons: [1, 2].map((m) => ({ id: `lesson-${n}-${m}`, title: `Lecke ${n}/${m}`, sort: m, done: false })) })) }]
};
const mount = async (value) => { await page.evaluate(async (data) => { const { mountCurriculum } = await import('/src/lib/components/lesson/__tests__/curriculum-editor-fixture.ts'); await mountCurriculum(data); }, value); };
const button = (name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
const calls = [];
await page.route('**/api/curriculum', async (route) => { calls.push(route.request().postDataJSON()); await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
for (const width of [1100, 390]) {
	await page.setViewportSize({ width, height: 844 });
	await mount(data);
	await button('Témakör műveletei: Témakör 1').waitFor();
	assert.equal(await page.getByRole('button', { name: /^Lecke (feljebb|lejjebb):/ }).count(), 12);
	assert.ok(await button('Lecke feljebb: Lecke 1/1').isDisabled());
	assert.ok(await button('Lecke lejjebb: Lecke 1/2').isDisabled());
	await button('Témakör műveletei: Témakör 1').click();
	const menu = page.locator('.dropdown-shell.icons-only[data-open="true"]');
	assert.equal(await menu.locator('button').count(), 4);
	assert.equal(new Set(await menu.locator('button').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().y))).size, 1);
	assert.ok((await menu.boundingBox()).width < 190);
	assert.ok((await menu.boundingBox()).height < 65);
	assert.ok(await button('Témakör feljebb: Témakör 1').isDisabled());
	await page.keyboard.press('Escape');
	assert.equal(await page.locator('.dropdown-shell[data-open="true"]').count(), 0);
	const search = page.getByRole('searchbox', { name: 'Keresés a témakörök és leckék között' });
	await search.fill('Lecke 2/2');
	assert.equal(await page.getByRole('link', { name: /^Lecke/ }).count(), 1);
	assert.ok(await button('Lecke feljebb: Lecke 2/2').isEnabled());
	assert.ok(await button('Lecke lejjebb: Lecke 2/2').isDisabled());
	await button('Témakör műveletei: Témakör 2').click();
	assert.ok(await button('Témakör feljebb: Témakör 2').isEnabled());
	assert.ok(await button('Témakör lejjebb: Témakör 2').isEnabled());
	await page.keyboard.press('Escape');
	await button('Lecke feljebb: Lecke 2/2').click();
	await page.waitForFunction(() => document.querySelector('[aria-busy="false"]'));
	assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify({ action: 'reorderLessons', levelId: 'level-test', topicId: 'topic-2', ids: ['lesson-2-2', 'lesson-2-1'] }));
	await button('Témakör műveletei: Témakör 2').click();
	await button('Témakör lejjebb: Témakör 2').click();
	await page.waitForFunction(() => document.querySelector('[aria-busy="false"]'));
	assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify({ action: 'reorderTopics', levelId: 'level-test', ids: ['topic-1', 'topic-3', 'topic-2'] }));
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}
await mount({ ...data, levels: [{ ...data.levels[0], canEdit: false }] });
assert.equal(await page.getByRole('button', { name: /^(Lecke (feljebb|lejjebb):|Témakör műveletei:)/ }).count(), 0);
console.log('PASS: kompakt témakörmenü, állandó leckesorrend-gombok, szélső elemek tiltása, keresés alatti teljes sorrend, helyes átrendezési kérés és jogosultság asztali és mobilnézetben.');

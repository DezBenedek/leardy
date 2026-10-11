import assert from 'node:assert/strict';
import test from 'node:test';
import { typescriptModuleUrl } from './typescript-module.mjs';

const model = await import(await typescriptModuleUrl(new URL('../src/lib/lesson-content.ts', import.meta.url)));
const { markdownLessonDoc } = await import(await typescriptModuleUrl(new URL('../src/lib/lesson-markdown.ts', import.meta.url)));
const { renderLessonDoc, validLessonMath } = await import(await typescriptModuleUrl(new URL('../src/lib/lesson-render.ts', import.meta.url)));
const { splitSections } = await import(await typescriptModuleUrl(new URL('../src/lib/markdown.ts', import.meta.url)));
const text = (value) => ({ type: 'text', text: value });
const p = (value) => ({ type: 'paragraph', content: [text(value)] });
const document = (nodes) => ({ version: 1, sections: [{ slug: 'elso', title: 'Első', intro: false, doc: { type: 'doc', content: nodes } }] });

test('A teljes tartalomkészlet mentés után is azonos, és olvasható Markdownná alakítható', () => {
	const content = document([
		p('Árvíztűrő tükörfúrógép'),
		{ type: 'heading', attrs: { level: 3 }, content: [text('Alcím')] },
		{ type: 'paragraph', content: [{ ...text('Formázás'), marks: ['bold', 'italic', 'underline', 'strike', 'highlight', 'subscript', 'superscript', 'code'].map((type) => ({ type })) }, { type: 'inlineMath', attrs: { latex: 'x^2' } }] },
		{ type: 'figure', attrs: { src: '/api/lesson-images/12345678-1234-1234-1234-123456789abc', alt: 'Ábra', caption: 'Képaláírás', width: 'half' } },
		{ type: 'blockMath', attrs: { latex: '\\frac{1}{2}' } },
		{ type: 'callout', attrs: { kind: 'tip' }, content: [p('Tipp')] },
		{ type: 'solution', attrs: { title: 'Megoldás megtekintése' }, content: [p('Megoldás')] },
		{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [p('Fogalom')] }] }, { type: 'tableRow', content: [{ type: 'tableCell', content: [p('Érték')] }] }] },
		{ type: 'codeBlock', attrs: { language: 'js' }, content: [text('const érték = 1;')] },
		{ type: 'rawMarkdown', attrs: { source: '<ismeretlen>Megőrzött tartalom</ismeretlen>' } }
	]);
	const saved = model.validateLessonContent(content);
	assert.deepEqual(model.readLessonContent(JSON.stringify(saved)), saved);
	const html = renderLessonDoc(saved.sections[0].doc);
	assert.match(html, /<figure data-width="half">/);
	assert.match(html, /<figcaption>Képaláírás<\/figcaption>/);
	assert.match(html, /<details><summary>Megoldás megtekintése/);
	assert.match(html, /<math/);
	assert.match(html, /&lt;ismeretlen&gt;/);
	assert.match(model.lessonContentMarkdown(saved), /<!-- section:elso -->/);
	assert.deepEqual(model.lessonSections({ body_md: '', content: saved }).map((s) => s.slug), ['elso']);
});

test('A hibás dokumentum, veszélyes URL és túl nagy tartalom nem menthető', () => {
	for (const node of [
		{ type: 'script', content: [text('alert(1)')] },
		{ type: 'figure', attrs: { src: 'javascript:alert(1)' } },
		{ type: 'figure', attrs: { src: 'data:image/svg+xml,bármi' } },
		{ type: 'paragraph', content: [{ ...text('Link'), marks: [{ type: 'link', attrs: { href: 'java\nscript:alert(1)' } }] }] },
		{ type: 'paragraph', content: [p('Hibás beágyazás')] },
		{ type: 'heading', attrs: { level: 2 }, content: [text('Nem új bekezdés')] },
		p('x'.repeat(200_001))
	]) assert.throws(() => model.validateLessonContent(document([node])));
	const duplicate = document([p('Szöveg')]); duplicate.sections.push(duplicate.sections[0]);
	assert.throws(() => model.validateLessonContent(duplicate));
	assert.equal(model.readLessonContent({ version: 2, sections: [] }), null);
	assert.doesNotMatch(renderLessonDoc({ type: 'paragraph', content: [{ ...text('<script>'), marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }), /href=|<script>/);
	assert.equal(validLessonMath('\\frac{1}{2}'), true);
	assert.equal(validLessonMath('\\frac{'), false);
	assert.equal(validLessonMath('\\placeholder{}'), false);
});

test('A Markdown-import megőrzi a listákat, táblázatokat, képeket, kódot és ismeretlen szöveget', () => {
	const source = '### Alcím\n\n**Félkövér** és *dőlt* [link](https://example.com).\n\n1. Első\n2. Második\n\n![Ábra](https://example.com/kep.png "Képaláírás")\n\n| Fogalom | Jel |\n| --- | --- |\n| Erő | F |\n\n```js\n## Ez kód\n```\n\n<div>Megőrzött HTML</div>';
	const doc = markdownLessonDoc(source);
	model.validateLessonContent(document(doc.content));
	const html = renderLessonDoc(doc);
	for (const expected of ['<strong>Félkövér</strong>', '<ol', '<table', '<figure', '## Ez kód', '&lt;div&gt;Megőrzött HTML&lt;/div&gt;']) assert.ok(html.includes(expected), expected);
	const sections = splitSections('## Első\n<!-- section:elso -->\n\n```md\n## Nem bekezdés\n```\n\n## Második\nTartalom');
	assert.deepEqual(sections.map((s) => s.slug), ['elso', 'masodik']);
	model.validateLessonContent(document(markdownLessonDoc('Szöveg <b>HTML</b> után.').content));
});

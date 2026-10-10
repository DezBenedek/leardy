import katex from 'katex';
import { safeLessonLink, type LessonNode } from './lesson-content';
import { normalizeQuestionImageUrl } from './question-image';

export const lessonEscapeHtml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function renderLessonMath(latex: string, displayMode = false): string {
	try { return katex.renderToString(latex, { displayMode, throwOnError: true, trust: false, maxExpand: 1000, maxSize: 20, output: 'htmlAndMathml', strict: 'ignore' }); }
	catch { return `<span class="lesson-math-error" title="A képlet nem jeleníthető meg">${lessonEscapeHtml(latex)}</span>`; }
}
export function validLessonMath(latex: string): boolean {
	if (!latex.trim() || latex.length > 10_000 || /\\placeholder\b/.test(latex)) return false;
	try { katex.renderToString(latex, { throwOnError: true, trust: false, maxExpand: 1000, maxSize: 20, strict: 'ignore' }); return true; } catch { return false; }
}

/** Az olvasóban nincs contenteditable vagy szerkesztőkönyvtár. Minden attribútum ellenőrzött. */
export function renderLessonDoc(node: LessonNode): string {
	const e = lessonEscapeHtml;
	const a = node.attrs ?? {};
	const inner = (node.content ?? []).map(renderLessonDoc).join('');
	if (node.type === 'text') {
		let out = e(node.text);
		const tags: Record<string, string> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', highlight: 'mark', subscript: 'sub', superscript: 'sup', code: 'code' };
		for (const mark of node.marks ?? []) {
			if (tags[mark.type]) out = `<${tags[mark.type]}>${out}</${tags[mark.type]}>`;
			else if (mark.type === 'link' && safeLessonLink(mark.attrs?.href)) out = `<a href="${e(safeLessonLink(mark.attrs?.href))}" rel="noopener noreferrer">${out}</a>`;
		}
		return out;
	}
	if (node.type === 'doc') return inner;
	if (node.type === 'heading') return `<h${a.level === 4 ? 4 : 3}>${inner}</h${a.level === 4 ? 4 : 3}>`;
	if (node.type === 'hardBreak') return '<br>';
	if (node.type === 'horizontalRule') return '<hr>';
	if (node.type === 'codeBlock') return `<pre><code>${inner}</code></pre>`;
	if (node.type === 'rawMarkdown') return `<pre class="lesson-raw">${e(a.source)}</pre>`;
	if (node.type === 'figure') {
		const src = normalizeQuestionImageUrl(a.src);
		return src ? `<figure data-width="${a.width === 'half' ? 'half' : 'full'}"><img src="${e(src)}" alt="${e(a.alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">${a.caption ? `<figcaption>${e(a.caption)}</figcaption>` : ''}</figure>` : '';
	}
	if (node.type === 'inlineMath' || node.type === 'blockMath') return `<${node.type === 'blockMath' ? 'div' : 'span'} class="lesson-math ${node.type === 'blockMath' ? 'lesson-math-block' : ''}">${renderLessonMath(String(a.latex ?? ''), node.type === 'blockMath')}</${node.type === 'blockMath' ? 'div' : 'span'}>`;
	if (node.type === 'callout') {
		const labels = { important: 'Fontos', example: 'Példa', tip: 'Tipp' };
		const kind = ['important', 'example', 'tip'].includes(String(a.kind)) ? String(a.kind) as keyof typeof labels : 'important';
		return `<aside data-callout="${kind}"><strong class="callout-label">${labels[kind]}</strong>${inner}</aside>`;
	}
	if (node.type === 'solution') return `<details><summary>${e(a.title || 'Megoldás')}</summary><div>${inner}</div></details>`;
	if (node.type === 'table') return `<div class="lesson-table-scroll"><table><tbody>${inner}</tbody></table></div>`;
	const tags: Record<string, string> = { paragraph: 'p', blockquote: 'blockquote', bulletList: 'ul', orderedList: 'ol', listItem: 'li', tableRow: 'tr', tableCell: 'td', tableHeader: 'th' };
	const tag = tags[node.type];
	return tag ? `<${tag}${node.type === 'orderedList' ? ` start="${Number(a.start) || 1}"` : ''}>${inner}</${tag}>` : inner;
}

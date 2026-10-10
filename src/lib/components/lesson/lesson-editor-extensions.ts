import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table';
import { Mathematics } from '@tiptap/extension-mathematics';
import { safeLessonLink } from '$lib/lesson-content';
import { normalizeQuestionImageUrl } from '$lib/question-image';

export function lessonEditorExtensions(onMath: (pos: number, latex: string, block: boolean) => void, onFigure: (pos: number) => void, onSolution: (pos: number, title: string) => void) {
	const Figure = Node.create({
		name: 'figure', group: 'block', atom: true, draggable: true,
		addAttributes: () => ({ src: { default: '' }, alt: { default: '' }, caption: { default: '' }, width: { default: 'full' } }),
		parseHTML: () => [{ tag: 'figure', getAttrs: (el) => { const src = normalizeQuestionImageUrl(el.querySelector('img')?.getAttribute('src')); return src ? { src, alt: el.querySelector('img')?.getAttribute('alt') ?? '', caption: el.querySelector('figcaption')?.textContent ?? '', width: el.getAttribute('data-width') === 'half' ? 'half' : 'full' } : false; } }, { tag: 'img[src]', getAttrs: (el) => { const src = normalizeQuestionImageUrl(el.getAttribute('src')); return src ? { src, alt: el.getAttribute('alt') ?? '' } : false; } }],
		renderHTML: ({ node }) => ['figure', { 'data-width': node.attrs.width }, ['img', { src: normalizeQuestionImageUrl(node.attrs.src) || undefined, alt: node.attrs.alt, referrerpolicy: 'no-referrer' }], ['figcaption', {}, node.attrs.caption || '']],
		addNodeView() {
			return ({ node, getPos }) => {
				const dom = document.createElement('figure');
				dom.dataset.width = node.attrs.width;
				dom.tabIndex = 0;
				dom.setAttribute('role', 'button');
				dom.setAttribute('aria-label', 'Kép szerkesztése');
				const img = document.createElement('img');
				const src = normalizeQuestionImageUrl(node.attrs.src);
				if (src) img.src = src;
				img.alt = node.attrs.alt; img.referrerPolicy = 'no-referrer';
				const caption = document.createElement('figcaption');
				caption.textContent = node.attrs.caption || 'Kattints a kép szerkesztéséhez';
				dom.append(img, caption);
				const edit = () => { const pos = getPos(); if (pos !== undefined) onFigure(pos); };
				dom.onclick = edit;
				dom.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); edit(); } };
				return { dom, stopEvent: (event) => event.type === 'click' };
			};
		}
	});
	const Callout = Node.create({
		name: 'callout', group: 'block', content: 'block+', defining: true,
		addAttributes: () => ({ kind: { default: 'important' } }),
		parseHTML: () => [{ tag: 'aside[data-callout]', getAttrs: (el) => ({ kind: el.getAttribute('data-callout') }) }],
		renderHTML: ({ node, HTMLAttributes }) => ['aside', mergeAttributes(HTMLAttributes, { 'data-callout': node.attrs.kind }), 0]
	});
	const Solution = Node.create({
		name: 'solution', group: 'block', content: 'block+', defining: true,
		addAttributes: () => ({ title: { default: 'Megoldás' } }),
		parseHTML: () => [{ tag: 'details', getAttrs: (el) => ({ title: el.querySelector('summary')?.textContent ?? 'Megoldás' }), contentElement: 'div' }],
		renderHTML: ({ node }) => ['details', { open: true }, ['summary', {}, node.attrs.title], ['div', {}, 0]],
		addNodeView() {
			return ({ node, getPos }) => {
				const dom = document.createElement('details'); dom.open = true;
				const summary = document.createElement('summary'); summary.textContent = node.attrs.title; summary.contentEditable = 'false';
				const contentDOM = document.createElement('div');
				summary.onclick = (event) => { event.preventDefault(); const pos = getPos(); if (pos !== undefined) onSolution(pos, node.attrs.title); };
				dom.append(summary, contentDOM);
				return { dom, contentDOM };
			};
		}
	});
	const Raw = Node.create({ name: 'rawMarkdown', group: 'block', atom: true, addAttributes: () => ({ source: { default: '' } }), parseHTML: () => [{ tag: 'pre[data-raw-markdown]' }], renderHTML: ({ node }) => ['pre', { 'data-raw-markdown': '', class: 'lesson-raw' }, node.attrs.source] });
	return [StarterKit.configure({ heading: { levels: [3, 4] }, link: { openOnClick: false, autolink: true, isAllowedUri: (url) => !!safeLessonLink(url) } }), Highlight, Subscript, Superscript,
		TableKit.configure({ table: { resizable: false } }), Figure, Callout, Solution, Raw,
		Mathematics.configure({ katexOptions: { throwOnError: false, trust: false, maxExpand: 1000, maxSize: 20, strict: 'ignore' }, inlineOptions: { onClick: (node, pos) => onMath(pos, node.attrs.latex, false) }, blockOptions: { onClick: (node, pos) => onMath(pos, node.attrs.latex, true) } })];
}

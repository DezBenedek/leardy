import { splitSections } from './markdown';
import { normalizeQuestionImageUrl } from './question-image';

export interface LessonMark { type: string; attrs?: Record<string, unknown> }
export interface LessonNode {
	type: string;
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: LessonMark[];
	content?: LessonNode[];
}
export interface LessonContentSection { slug: string; title: string; intro: boolean; doc: LessonNode }
export interface LessonContentV1 { version: 1; sections: LessonContentSection[] }
export const emptyLessonDoc = (): LessonNode => ({ type: 'doc', content: [{ type: 'paragraph' }] });
/** A blokkos elemek után is maradjon hely a gépelés folytatásához. */
export function editableLessonDoc(doc: LessonNode): LessonNode {
	return doc.content?.at(-1)?.type === 'paragraph' ? doc : { ...doc, content: [...(doc.content ?? []), { type: 'paragraph' }] };
}
export const MAX_LESSON_CONTENT_BYTES = 1_000_000;

export function safeLessonLink(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const url = value.trim();
	if (!url || url.length > 2048 || /[\u0000-\u0020\u007f]/.test(url) || url.startsWith('//')) return null;
	if (/^(?:https?:|mailto:)/i.test(url) || /^(?:\/(?!\/)|#)/.test(url)) return url;
	return null;
}

/** Közös, szigorú séma a kliens és a szerver között. Ismeretlen attribútumot nem tárolunk. */
export function validateLessonContent(value: unknown): LessonContentV1 {
	const fail = (): never => { throw new Error('A lecke tartalmának formátuma érvénytelen.'); };
	if (!value || typeof value !== 'object') return fail();
	const root = value as Record<string, unknown>;
	if (root.version !== 1 || !Array.isArray(root.sections) || root.sections.length > 500) return fail();
	let count = 0;
	let textLength = 0;
	const blocks = ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'codeBlock', 'horizontalRule', 'figure', 'blockMath', 'callout', 'solution', 'table', 'rawMarkdown'];
	function node(input: unknown, depth: number): LessonNode {
		if (++count > 20_000 || depth > 32 || !input || typeof input !== 'object') return fail();
		const v = input as LessonNode;
		const type = v.type;
		if (typeof type !== 'string') return fail();
		const a = v.attrs ?? {};
		const result: LessonNode = { type };
		const str = (key: string, max: number, fallback = '') => {
			const s = a[key] ?? fallback;
			if (typeof s !== 'string' || s.length > max) return fail();
			textLength += s.length;
			return s;
		};
		if (type === 'text') {
			if (typeof v.text !== 'string' || !v.text) return fail();
			result.text = v.text; textLength += v.text.length;
			if (v.marks) {
				if (!Array.isArray(v.marks) || v.marks.length > 12) return fail();
				result.marks = v.marks.map((mark) => {
					if (!mark || !['bold', 'italic', 'underline', 'strike', 'highlight', 'subscript', 'superscript', 'code', 'link'].includes(mark.type)) return fail();
					if (mark.type === 'link') {
						const href = safeLessonLink(mark.attrs?.href);
						if (!href) return fail();
						return { type: 'link', attrs: { href } };
					}
					return { type: mark.type };
				});
			}
		} else if (type === 'heading') {
			if (![3, 4].includes(Number(a.level))) return fail();
			result.attrs = { level: Number(a.level) };
		} else if (type === 'figure') {
			const src = normalizeQuestionImageUrl(a.src);
			if (!src || !['full', 'half'].includes(String(a.width ?? 'full'))) return fail();
			result.attrs = { src, alt: str('alt', 1000), caption: str('caption', 2000), width: a.width ?? 'full' };
		} else if (type === 'inlineMath' || type === 'blockMath') {
			const latex = str('latex', 10_000);
			if (!latex.trim()) return fail();
			result.attrs = { latex };
		} else if (type === 'callout') {
			if (!['important', 'example', 'tip'].includes(String(a.kind))) return fail();
			result.attrs = { kind: a.kind };
		} else if (type === 'solution') result.attrs = { title: str('title', 160, 'Megoldás') };
		else if (type === 'rawMarkdown') result.attrs = { source: str('source', 200_000) };
		else if (type === 'orderedList') {
			const start = Number(a.start ?? 1);
			if (!Number.isSafeInteger(start) || start < 1 || start > 1_000_000) return fail();
			result.attrs = { start };
		} else if (type === 'codeBlock') result.attrs = { language: str('language', 50) };
		else if (!['doc', 'paragraph', 'blockquote', 'bulletList', 'listItem', 'horizontalRule', 'hardBreak', 'table', 'tableRow', 'tableCell', 'tableHeader'].includes(type)) return fail();
		const leaves = ['text', 'figure', 'inlineMath', 'blockMath', 'horizontalRule', 'hardBreak', 'rawMarkdown'];
		if (leaves.includes(type)) {
			if (v.content?.length) return fail();
			return result;
		}
		if (v.content !== undefined && !Array.isArray(v.content)) return fail();
		const children = (v.content ?? []).map((n) => node(n, depth + 1));
		const allowed = ['paragraph', 'heading'].includes(type) ? ['text', 'inlineMath', 'hardBreak'] :
			type === 'codeBlock' ? ['text'] : ['bulletList', 'orderedList'].includes(type) ? ['listItem'] :
			type === 'table' ? ['tableRow'] : type === 'tableRow' ? ['tableCell', 'tableHeader'] : blocks;
		if (children.some((n) => !allowed.includes(n.type))) return fail();
		if (['bulletList', 'orderedList', 'listItem', 'table', 'tableRow', 'tableCell', 'tableHeader'].includes(type) && !children.length) return fail();
		if (type === 'listItem' && children[0]?.type !== 'paragraph') return fail();
		if (type === 'table' && children.some((row) => row.content?.length !== children[0].content?.length)) return fail();
		if (children.length) result.content = children;
		return result;
	}
	const slugs = new Set<string>();
	const sections = root.sections.map((input, index) => {
		if (!input || typeof input !== 'object') return fail();
		const s = input as LessonContentSection;
		if (typeof s.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,200}$/.test(s.slug) || slugs.has(s.slug)) return fail();
		slugs.add(s.slug);
		if (typeof s.title !== 'string' || !s.title.trim() || s.title.length > 160 || /[\r\n]/.test(s.title) || typeof s.intro !== 'boolean' || (s.intro && index !== 0)) return fail();
		const doc = node(s.doc, 0);
		if (doc.type !== 'doc') return fail();
		return { slug: s.slug, title: s.title.trim(), intro: s.intro, doc };
	});
	const result: LessonContentV1 = { version: 1, sections };
	if (textLength > 200_000 || new TextEncoder().encode(JSON.stringify(result)).length > MAX_LESSON_CONTENT_BYTES) throw new Error('A lecke tartalma túl hosszú.');
	return result;
}

export function readLessonContent(raw: unknown): LessonContentV1 | null {
	if (!raw) return null;
	try { return validateLessonContent(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch { return null; }
}

/** A bekezdések forrása minden olvasóban és választóban azonos. */
export function lessonSections(lesson: { body_md: string; content?: LessonContentV1 | null }) {
	return lesson.content ? lesson.content.sections.map((s) => ({ ...s, md: '' })) : splitSections(lesson.body_md).map((s) => ({ ...s, doc: undefined }));
}

export function lessonNodeText(node: LessonNode): string {
	return node.text ?? String(node.attrs?.caption ?? node.attrs?.latex ?? node.attrs?.source ?? '') + (node.content ?? []).map(lessonNodeText).join(' ');
}

/** Olvasható Markdown-változat a régi kliensek és exportok számára. */
export function lessonContentMarkdown(content: LessonContentV1): string {
	const esc = (s: string) => s.replace(/([\\`*_[\]<>#])/g, '\\$1');
	function md(n: LessonNode): string {
		const a = n.attrs ?? {};
		const children = n.content ?? [];
		const inline = children.map(md).join('');
		if (n.type === 'text') {
			let s = esc(n.text ?? '');
			for (const m of n.marks ?? []) {
				if (m.type === 'bold') s = `**${s}**`;
				if (m.type === 'italic') s = `*${s}*`;
				if (m.type === 'strike') s = `~~${s}~~`;
				if (m.type === 'code') s = `\`${n.text}\``;
				if (m.type === 'link') s = `[${s}](${String(m.attrs?.href).replaceAll(')', '%29')})`;
			}
			return s;
		}
		if (n.type === 'hardBreak') return '  \n';
		if (n.type === 'inlineMath') return `$${a.latex}$`;
		if (n.type === 'blockMath') return `$$\n${a.latex}\n$$`;
		if (n.type === 'heading') return `${'#'.repeat(Number(a.level))} ${inline}`;
		if (n.type === 'paragraph') return inline;
		if (n.type === 'figure') return `![${esc(String(a.alt))}](${String(a.src).replaceAll(')', '%29')})${a.caption ? `\n\n${esc(String(a.caption))}` : ''}`;
		if (n.type === 'codeBlock') return `\`\`\`\` ${a.language ?? ''}\n${children.map((c) => c.text ?? '').join('')}\n\`\`\`\``;
		if (n.type === 'rawMarkdown') return String(a.source ?? '');
		if (n.type === 'horizontalRule') return '---';
		if (['bulletList', 'orderedList'].includes(n.type)) return children.map((c, i) => `${n.type === 'bulletList' ? '-' : `${Number(a.start ?? 1) + i}.`} ${md(c).replaceAll('\n', '\n  ')}`).join('\n');
		if (n.type === 'table') return children.map((row, i) => `| ${(row.content ?? []).map((c) => md(c).replaceAll('|', '\\|').replaceAll('\n', ' ')).join(' | ')} |${i === 0 ? `\n| ${(row.content ?? []).map(() => '---').join(' | ')} |` : ''}`).join('\n');
		const body = children.map(md).join('\n\n');
		if (['blockquote', 'callout', 'solution'].includes(n.type)) return `${n.type === 'solution' ? `${esc(String(a.title))}\n\n` : ''}${body}`.split('\n').map((line) => `> ${line}`).join('\n');
		return body;
	}
	return content.sections.map((s) => `${s.intro ? '' : `## ${s.title}\n<!-- section:${s.slug} -->\n\n`}${md(s.doc)}`).join('\n\n');
}

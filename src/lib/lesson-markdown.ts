import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { normalizeQuestionImageUrl } from './question-image';
import { safeLessonLink, type LessonNode, type LessonMark } from './lesson-content';

interface MdNode {
	type: string; value?: string; depth?: number; url?: string; alt?: string; title?: string;
	ordered?: boolean; start?: number; lang?: string; checked?: boolean | null; children?: MdNode[];
	position?: { start: { offset?: number }; end: { offset?: number } };
}
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath, { singleDollarTextMath: false });

/** AST-alapú import: a kód és az ismeretlen Markdown sem tűnhet el. */
export function markdownLessonDoc(source: string): LessonNode {
	const tree = parser.parse(source) as MdNode;
	function convert(n: MdNode, marks: LessonMark[] = []): LessonNode[] {
		const children = () => (n.children ?? []).flatMap((c) => convert(c, marks));
		const wrap = (type: string, attrs?: Record<string, unknown>) => [{ type, ...(attrs ? { attrs } : {}), content: children() }];
		if (n.type === 'text') return n.value ? [{ type: 'text', text: n.value, ...(marks.length ? { marks } : {}) }] : [];
		if (n.type === 'strong' || n.type === 'emphasis' || n.type === 'delete') return (n.children ?? []).flatMap((c) => convert(c, [...marks, { type: n.type === 'strong' ? 'bold' : n.type === 'emphasis' ? 'italic' : 'strike' }]));
		if (n.type === 'inlineCode') return [{ type: 'text', text: n.value || ' ', marks: [...marks, { type: 'code' }] }];
		if (n.type === 'link' && safeLessonLink(n.url)) return (n.children ?? []).flatMap((c) => convert(c, [...marks, { type: 'link', attrs: { href: n.url } }]));
		if (n.type === 'paragraph') {
			const content = children();
			const result: LessonNode[] = [];
			let inline: LessonNode[] = [];
			for (const node of content) {
				if (node.type === 'figure') { if (inline.length) result.push({ type: 'paragraph', content: inline }); inline = []; result.push(node); }
				else inline.push(node.type === 'rawMarkdown' ? { type: 'text', text: String(node.attrs?.source || ' ') } : node);
			}
			if (inline.length || !result.length) result.push({ type: 'paragraph', content: inline });
			return result;
		}
		if (n.type === 'heading') return wrap('heading', { level: Math.max(3, Math.min(4, n.depth ?? 3)) });
		if (n.type === 'blockquote') return wrap('blockquote');
		if (n.type === 'list') return wrap(n.ordered ? 'orderedList' : 'bulletList', n.ordered ? { start: n.start || 1 } : undefined);
		if (n.type === 'listItem') {
			const content = children();
			if (content[0]?.type !== 'paragraph') content.unshift({ type: 'paragraph' });
			if (typeof n.checked === 'boolean') content[0].content = [{ type: 'text', text: n.checked ? '☑ ' : '☐ ' }, ...(content[0].content ?? [])];
			return [{ type: 'listItem', content }];
		}
		if (n.type === 'code') return [{ type: 'codeBlock', attrs: { language: n.lang ?? '' }, content: n.value ? [{ type: 'text', text: n.value }] : [] }];
		if (n.type === 'break') return [{ type: 'hardBreak' }];
		if (n.type === 'thematicBreak') return [{ type: 'horizontalRule' }];
		if (n.type === 'math' || n.type === 'inlineMath') return [{ type: n.type === 'math' ? 'blockMath' : 'inlineMath', attrs: { latex: n.value || ' ' } }];
		if (n.type === 'image' && normalizeQuestionImageUrl(n.url)) return [{ type: 'figure', attrs: { src: normalizeQuestionImageUrl(n.url), alt: n.alt ?? '', caption: n.title ?? '', width: 'full' } }];
		if (n.type === 'table') return [{ type: 'table', content: (n.children ?? []).map((row, i) => ({ type: 'tableRow', content: (row.children ?? []).map((cell) => ({ type: i === 0 ? 'tableHeader' : 'tableCell', content: [{ type: 'paragraph', content: (cell.children ?? []).flatMap((c) => convert(c)) }] })) })) }];
		const raw = source.slice(n.position?.start.offset ?? 0, n.position?.end.offset ?? source.length);
		if (marks.length || ['link', 'linkReference', 'imageReference'].includes(n.type)) return [{ type: 'text', text: raw || n.value || ' ' }];
		return [{ type: 'rawMarkdown', attrs: { source: raw || n.value || '' } }];
	}
	const content = (tree.children ?? []).flatMap((n) => convert(n));
	return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

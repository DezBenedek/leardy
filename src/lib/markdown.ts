/* Független markdown-segéd a leckeoldalhoz: slug, szekcióvágás, mini-render.
   Nincs külső függősége. */

import type { LessonSection } from '$lib/curriculum';

const ACCENTS: Record<string, string> = {
	á: 'a',
	é: 'e',
	í: 'i',
	ó: 'o',
	ö: 'o',
	ő: 'o',
	ú: 'u',
	ü: 'u',
	ű: 'u'
};

/** URL-barát slug magyar ékezetkezeléssel. */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.split('')
		.map((ch) => ACCENTS[ch] ?? ch)
		.join('')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** ## H2-címsorok mentén vág; a cím előtti intro a 'bevezetes' szekció. */
export function splitSections(md: string): LessonSection[] {
	const lines = md.split('\n');
	const sections: LessonSection[] = [];
	let title: string | null = null;
	let buf: string[] = [];

	function flush() {
		const body = buf.join('\n').trim();
		if (title === null) {
			if (body) sections.push({ slug: 'bevezetes', title: 'Bevezetés', md: body });
		} else {
			sections.push({ slug: slugify(title), title, md: body });
		}
		buf = [];
	}

	for (const line of lines) {
		const m = line.match(/^##\s+(.*)$/);
		if (m) {
			flush();
			title = m[1].trim();
		} else {
			buf.push(line);
		}
	}
	flush();
	return sections;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function safeLinkHref(href: string): string {
	const compact = href.replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase();
	const scheme = compact.match(/^([a-z][a-z0-9+.-]*):/)?.[1];
	if (scheme && scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto') return '#';
	return href;
}

/** Soron belüli formázás (escape-elt szövegen fut). */
function inline(s: string): string {
	let out = escapeHtml(s);
	out = out.replace(/`([^`]+?)`/g, '<code class="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[0.9em] text-ink-900 dark:bg-white/10 dark:text-stone-100">$1</code>');
	out = out.replace(
		/\[([^\]]+?)\]\(([^)\s]+?)\)/g,
		(_match, label: string, target: string) =>
			`<a href="${safeLinkHref(target)}" class="font-medium text-brand-600 underline decoration-brand-300 underline-offset-2 hover:text-brand-700 dark:text-brand-300 dark:decoration-brand-500/50">${label}</a>`
	);
	out = out.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
	out = out.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
	return out;
}

/** Minimál markdown → HTML: ##/### címsorok, listák, linkek, vastag/dőlt/kód, bekezdések. */
export function renderMarkdown(md: string): string {
	const lines = md.split('\n');
	const html: string[] = [];
	let para: string[] = [];
	let list: string[] = [];

	function flushPara() {
		if (para.length > 0) {
			html.push(`<p>${inline(para.join(' '))}</p>`);
			para = [];
		}
	}

	function flushList() {
		if (list.length > 0) {
			html.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
			list = [];
		}
	}

	for (const raw of lines) {
		const line = raw.trim();
		if (!line) {
			flushPara();
			flushList();
			continue;
		}
		let m = line.match(/^###\s+(.*)$/);
		if (m) {
			flushPara();
			flushList();
			const t = m[1].trim();
			html.push(`<h3 id="${slugify(t)}">${inline(t)}</h3>`);
			continue;
		}
		m = line.match(/^##\s+(.*)$/);
		if (m) {
			flushPara();
			flushList();
			const t = m[1].trim();
			html.push(`<h2 id="${slugify(t)}">${inline(t)}</h2>`);
			continue;
		}
		m = line.match(/^-\s+(.*)$/);
		if (m) {
			flushPara();
			list.push(m[1].trim());
			continue;
		}
		flushList();
		para.push(line);
	}
	flushPara();
	flushList();
	return html.join('\n');
}

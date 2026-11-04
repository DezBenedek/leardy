/* Független markdown-segéd a leckeoldalhoz: slug, szekcióvágás, mini-render.
   Nincs külső függősége. */

import type { LessonSection } from '$lib/curriculum/curriculum';

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
	const lines = md.split(/\r?\n/);
	const sections: LessonSection[] = [];
	const usedSlugs = new Set<string>();
	let title: string | null = null;
	let stableSlug: string | null = null;
	let buf: string[] = [];
	let fence: { char: string; size: number } | null = null;

	function uniqueSlug(base: string): string {
		let slug = base;
		let suffix = 2;
		while (usedSlugs.has(slug)) slug = `${base}-${suffix++}`;
		usedSlugs.add(slug);
		return slug;
	}

	function flush() {
		const body = buf.join('\n').trim();
		if (title === null) {
			if (body) sections.push({ slug: uniqueSlug('bevezetes'), title: 'Bevezetés', md: body, intro: true });
		} else {
			sections.push({ slug: uniqueSlug(stableSlug ?? (slugify(title) || 'bekezdes')), title, md: body, intro: false });
		}
		buf = [];
	}

	for (const line of lines) {
		const codeFence = line.match(/^ {0,3}(`{3,}|~{3,})/);
		if (codeFence) {
			const run = codeFence[1];
			if (!fence) fence = { char: run[0], size: run.length };
			else if (run[0] === fence.char && run.length >= fence.size && /^ {0,3}(?:`+|~+)[ \t]*$/.test(line)) fence = null;
			buf.push(line);
			continue;
		}
		if (fence) { buf.push(line); continue; }
		const m = line.match(/^##[ \t]+(.*)$/);
		if (m) {
			flush();
			title = m[1].trim();
			stableSlug = null;
		} else {
			const marker = line.match(/^<!-- section:([a-z0-9][a-z0-9-]*) -->$/);
			if (title !== null && marker && buf.every((part) => !part.trim())) {
				stableSlug = marker[1];
				continue;
			}
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

/** Minimál markdown → HTML: #/##/### címsorok, táblázatok, listák, idézetek, linkek, vastag/dőlt/kód, bekezdések. */
export function renderMarkdown(md: string): string {
	const lines = md.split('\n');
	const html: string[] = [];
	let para: string[] = [];
	let list: string[] = [];
	let ordered: string[] = [];
	let quote: string[] = [];
	let table: string[] = [];

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

	function flushOrdered() {
		if (ordered.length > 0) {
			html.push(`<ol>${ordered.map((li) => `<li>${inline(li)}</li>`).join('')}</ol>`);
			ordered = [];
		}
	}

	function flushQuote() {
		if (quote.length > 0) {
			const paras: string[] = [];
			let buf: string[] = [];
			for (const line of [...quote, '']) {
				if (!line.trim()) {
					if (buf.length > 0) {
						paras.push(`<p>${inline(buf.join(' '))}</p>`);
						buf = [];
					}
				} else {
					buf.push(line.trim());
				}
			}
			html.push(`<blockquote>${paras.join('')}</blockquote>`);
			quote = [];
		}
	}

	function splitCells(row: string): string[] {
		const cells: string[] = [];
		let current = '';
		let escaped = false;
		const trimmed = row.trim();
		const inner = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
		const body = inner.endsWith('|') ? inner.slice(0, -1) : inner;
		for (const ch of body) {
			if (escaped) {
				current += ch === '|' ? '|' : `\\${ch}`;
				escaped = false;
			} else if (ch === '\\') {
				escaped = true;
			} else if (ch === '|') {
				cells.push(current.trim());
				current = '';
			} else {
				current += ch;
			}
		}
		if (escaped) current += '\\';
		cells.push(current.trim());
		return cells;
	}

	function isSeparator(row: string): boolean {
		const cells = splitCells(row);
		return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
	}

	function cellAlign(cell: string): string {
		const left = cell.startsWith(':');
		const right = cell.endsWith(':');
		if (left && right) return ' style="text-align:center"';
		if (right) return ' style="text-align:right"';
		return '';
	}

	function flushTable() {
		if (table.length > 0) {
			const rows = table;
			table = [];
			if (rows.length >= 2 && isSeparator(rows[1])) {
				const head = splitCells(rows[0]);
				const aligns = splitCells(rows[1]).map(cellAlign);
				const th = head
					.map((cell, i) => `<th${aligns[i] ?? ''}>${inline(cell)}</th>`)
					.join('');
				const body = rows
					.slice(2)
					.map(
						(row) =>
							`<tr>${splitCells(row)
								.map((cell, i) => `<td${aligns[i] ?? ''}>${inline(cell)}</td>`)
								.join('')}</tr>`
					)
					.join('');
				html.push(`<div class="lesson-table-scroll"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`);
			} else {
				for (const row of rows) para.push(row);
				flushPara();
			}
		}
	}

	function flushAll() {
		flushPara();
		flushList();
		flushOrdered();
		flushQuote();
		flushTable();
	}

	for (const raw of lines) {
		const line = raw.trim();
		if (/^<!-- section:[a-z0-9][a-z0-9-]* -->$/.test(line)) {
			flushAll();
			continue;
		}
		if (!line) {
			flushAll();
			continue;
		}
		let m = line.match(/^###\s+(.*)$/);
		if (m) {
			flushAll();
			const t = m[1].trim();
			html.push(`<h3 id="${slugify(t)}">${inline(t)}</h3>`);
			continue;
		}
		m = line.match(/^##\s+(.*)$/);
		if (m) {
			flushAll();
			const t = m[1].trim();
			html.push(`<h2 id="${slugify(t)}">${inline(t)}</h2>`);
			continue;
		}
		m = line.match(/^#\s+(.*)$/);
		if (m) {
			flushAll();
			const t = m[1].trim();
			html.push(`<h2 id="${slugify(t)}">${inline(t)}</h2>`);
			continue;
		}
		if (/^(---|\*\*\*|___)$/.test(line)) {
			flushAll();
			html.push('<hr>');
			continue;
		}
		if (line.startsWith('|')) {
			flushPara();
			flushList();
			flushOrdered();
			flushQuote();
			table.push(line);
			continue;
		}
		flushTable();
		m = line.match(/^>\s?(.*)$/);
		if (m) {
			flushPara();
			flushList();
			flushOrdered();
			quote.push(m[1]);
			continue;
		}
		flushQuote();
		m = line.match(/^-\s+(.*)$/);
		if (m) {
			flushPara();
			flushOrdered();
			list.push(m[1].trim());
			continue;
		}
		flushList();
		m = line.match(/^\d+[.)]\s+(.*)$/);
		if (m) {
			flushPara();
			ordered.push(m[1].trim());
			continue;
		}
		flushOrdered();
		para.push(line);
	}
	flushAll();
	return html.join('\n');
}

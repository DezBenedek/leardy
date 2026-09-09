// Automatikus kiejtés- és példamondat-keresés idegen szavakhoz.
// Angol: ingyenes szótár API (IPA + példa + hang). Német/olasz: Wiktionary (IPA, best-effort).
// Minden hiba csendben null — a kézi mezők mindig maradnak.

export interface WordMeta {
	ipa: string | null;
	example: string | null;
	audio: string | null;
}

export function lookupLang(category: string): 'en' | 'de' | 'it' | null {
	if (category === 'Angol') return 'en';
	if (category === 'Német') return 'de';
	if (category === 'Olasz') return 'it';
	return null;
}

/** Levágja a /.../, [...] keretet a nyers IPA-ról. */
export function cleanIpa(raw: string): string {
	return raw
		.trim()
		.replace(/^[/\[\(]+/, '')
		.replace(/[/\]\)]+$/, '')
		.trim();
}

/** Megjelenítéshez: /.../ formába. */
export function fmtIpa(ipa: string | null | undefined): string | null {
	if (!ipa) return null;
	const c = cleanIpa(ipa);
	return c ? `/${c}/` : null;
}

async function fetchJson(url: string, ms = 8000): Promise<unknown | null> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), ms);
	try {
		const res = await fetch(url, { signal: ctrl.signal });
		if (!res.ok) return null;
		return (await res.json()) as unknown;
	} catch {
		return null;
	} finally {
		clearTimeout(t);
	}
}

interface DictEntry {
	phonetic?: string;
	phonetics?: { text?: string; audio?: string }[];
	meanings?: { definitions?: { definition?: string; example?: string }[] }[];
}

async function lookupEnglish(word: string): Promise<WordMeta> {
	const data = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
	const out: WordMeta = { ipa: null, example: null, audio: null };
	if (!Array.isArray(data) || data.length === 0) return out;
	const e = data[0] as DictEntry;
	const withText = (e.phonetics ?? []).find((p) => p.text?.trim());
	const ipaRaw = withText?.text ?? e.phonetic ?? '';
	if (ipaRaw.trim()) out.ipa = cleanIpa(ipaRaw);
	const withAudio = (e.phonetics ?? []).find((p) => p.audio?.trim());
	if (withAudio?.audio) out.audio = withAudio.audio;
	for (const m of e.meanings ?? []) {
		for (const d of m.definitions ?? []) {
			if (d.example?.trim()) {
				out.example = d.example.trim();
				break;
			}
		}
		if (out.example) break;
	}
	return out;
}

async function wiktionaryWikitext(host: string, page: string): Promise<string | null> {
	const data = (await fetchJson(
		`https://${host}/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&origin=*`
	)) as { parse?: { wikitext?: { '*'?: string } } } | null;
	return data?.parse?.wikitext?.['*'] ?? null;
}

function capFirst(s: string): string {
	return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

async function lookupGerman(word: string): Promise<WordMeta> {
	const out: WordMeta = { ipa: null, example: null, audio: null };
	// A német főnevek nagybetűsek — próbáljuk az eredetit és a nagykezdőset is.
	const variants = word[0] === word[0]?.toUpperCase() ? [word] : [word, capFirst(word)];
	for (const v of variants) {
		const wt = await wiktionaryWikitext('de.wiktionary.org', v);
		if (!wt) continue;
		if (!out.ipa) {
			const m = wt.match(/\{\{Lautschrift\|([^}|]+)/);
			if (m?.[1]?.trim()) out.ipa = cleanIpa(m[1]);
		}
		if (!out.example) {
			// : [1] „Példamondat.“ vagy : [1] ''Példamondat.''
			const m =
				wt.match(/:\s*\[1\][^\n]*?[„"]([^“”"]{4,220})[“”"]/) ??
				wt.match(/:\s*\[1\][^\n]*?''([^'\n]{4,220})''/);
			if (m?.[1]?.trim()) out.example = m[1].trim();
		}
		if (out.ipa) break;
	}
	return out;
}

async function lookupItalian(word: string): Promise<WordMeta> {
	const out: WordMeta = { ipa: null, example: null, audio: null };
	const wt = await wiktionaryWikitext('it.wiktionary.org', word.toLowerCase());
	if (!wt) return out;
	const m = wt.match(/\{\{IPA\|([^}|]+)/);
	if (m?.[1]?.trim()) out.ipa = cleanIpa(m[1]);
	return out;
}

/** Fő belépési pont: szó + tantárgy-kategória -> IPA / példa / hang (csak ami sikerül). */
export async function lookupWord(word: string, category: string): Promise<WordMeta> {
	const w = word.trim().split('\n')[0]?.trim() ?? '';
	if (!w) return { ipa: null, example: null, audio: null };
	const lang = lookupLang(category);
	if (!lang) return { ipa: null, example: null, audio: null };
	try {
		if (lang === 'en') return await lookupEnglish(w);
		if (/\s/.test(w)) return { ipa: null, example: null, audio: null };
		if (lang === 'de') return await lookupGerman(w);
		return await lookupItalian(w);
	} catch {
		return { ipa: null, example: null, audio: null };
	}
}

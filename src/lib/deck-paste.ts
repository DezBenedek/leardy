/* Vágólapról beillesztett szókártya-tömb elemzése.
   Támogatott alakok (soronként egy pár):
     magyar;angol
     magyar;angol;      (záró pontosvessző megengedett)
     magyar<TAB>angol   (tabbal elválasztva)
     magyar|angol       (függőleges vonallal)
   Elválasztó hiányában az egysoros szöveg sima érték, többsoros
   elválasztó nélküli szöveg soronként előlap (üres hátlappal). */

export interface ParsedPair {
	front: string;
	back: string;
}

/** Egy sor kettévágása az első elválasztónál (; TAB |). */
export function splitPairLine(line: string): ParsedPair | null {
	const clean = line.replace(/\r/g, '').trim();
	if (!clean) return null;
	const idxTab = clean.indexOf('\t');
	const idxPipe = clean.indexOf('|');
	const idxSemi = clean.indexOf(';');
	let idx = -1;
	for (const i of [idxTab, idxPipe, idxSemi]) {
		if (i >= 0 && (idx < 0 || i < idx)) idx = i;
	}
	if (idx < 0) return { front: clean, back: '' };
	const front = clean.slice(0, idx).trim();
	let back = clean.slice(idx + 1).trim();
	// Záró elválasztók ("magyar;angol;") levágása.
	back = back.replace(/[;\t|]+$/, '').trim();
	if (!front && !back) return null;
	return { front, back };
}

/** Teljes beillesztett szöveg párokká alakítása. */
export function parsePastedPairs(text: string): ParsedPair[] {
	const raw = (text ?? '').replace(/\r\n?/g, '\n');
	if (!raw.trim()) return [];
	const lines = raw.split('\n');
	const out: ParsedPair[] = [];
	for (const line of lines) {
		const pair = splitPairLine(line);
		if (pair && (pair.front || pair.back)) out.push(pair);
	}
	return out;
}

/** Több kártyát érő beillesztés-e: több sor vagy elválasztó van benne. */
export function isMultiPaste(text: string): boolean {
	const raw = (text ?? '').replace(/\r\n?/g, '\n');
	if (!raw.trim()) return false;
	if (raw.includes('\n')) return parsePastedPairs(raw).length > 0;
	return splitPairLine(raw) !== null && /[;\t|]/.test(raw);
}

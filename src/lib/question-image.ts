export const MAX_QUESTION_IMAGE_BYTES = 10 * 1024 * 1024;
export const QUESTION_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/** Külső kép vagy az alkalmazás saját, környezettől független R2-hivatkozása. */
export function normalizeQuestionImageUrl(value: unknown): string | null {
	if (value === undefined || value === null || value === '') return '';
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return '';
	if (trimmed.length > 2048) return null;
	if (/^\/api\/quiz-images\/[a-f0-9-]{36}$/.test(trimmed)) return trimmed;
	try {
		const url = new URL(trimmed);
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
		return url.href;
	} catch { return null; }
}

/** A fájl tényleges tartalma alapján, a böngésző MIME-jelölésétől függetlenül. */
export function questionImageMime(bytes: Uint8Array): string | null {
	const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
	if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png';
	if (['GIF87a', 'GIF89a'].includes(text(0, 6))) return 'image/gif';
	if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
	if (text(4, 8) === 'ftyp' && ['avif', 'avis'].includes(text(8, 12))) return 'image/avif';
	return null;
}

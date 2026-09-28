import type { R2Bucket } from '@cloudflare/workers-types';
import type { RequestEvent } from '@sveltejs/kit';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const ALLOWED_IMAGE_MIMES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/heic',
	'image/heif'
]);

export function getUploadsBucket(event: RequestEvent): R2Bucket | null {
	try {
		const bucket = (event.platform?.env as { UPLOADS?: R2Bucket } | undefined)?.UPLOADS;
		return bucket ?? null;
	} catch {
		return null;
	}
}

export function safeFileName(name: string): string {
	const base = String(name ?? '').split('/').pop()?.split('\\').pop() ?? 'fajl';
	const cleaned = base.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 120);
	return cleaned || 'fajl';
}

export function extFor(mime: string, fallbackName: string): string {
	const fromName = fallbackName.includes('.') ? fallbackName.split('.').pop() ?? '' : '';
	if (fromName && /^[a-zA-Z0-9]{1,8}$/.test(fromName)) return fromName.toLowerCase();
	if (mime === 'image/jpeg') return 'jpg';
	if (mime === 'image/png') return 'png';
	if (mime === 'image/webp') return 'webp';
	if (mime === 'image/gif') return 'gif';
	if (mime === 'audio/wav' || mime === 'audio/x-wav') return 'wav';
	if (mime === 'audio/mpeg') return 'mp3';
	if (mime === 'audio/webm') return 'webm';
	if (mime === 'audio/mp4' || mime === 'audio/x-m4a') return 'm4a';
	if (mime === 'audio/ogg') return 'ogg';
	return 'bin';
}

/** Tárolt MIME + fájlnév alapján a legjobb lejátszható típus. */
export function guessMediaMime(fileName: string, stored: string): string {
	if (stored && stored !== 'application/octet-stream') return stored;
	const ext = (fileName.split('.').pop() ?? '').toLowerCase();
	const map: Record<string, string> = {
		wav: 'audio/wav',
		mp3: 'audio/mpeg',
		m4a: 'audio/mp4',
		mp4: 'audio/mp4',
		webm: 'audio/webm',
		ogg: 'audio/ogg',
		oga: 'audio/ogg',
		opus: 'audio/ogg',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		webp: 'image/webp',
		gif: 'image/gif',
		pdf: 'application/pdf'
	};
	return map[ext] ?? 'application/octet-stream';
}

/** Egytartományos Range fejléc értelmezése. Többszörös vagy hibás tartományra null. */
export function parseRange(header: string, total: number): { offset: number; length: number } | null {
	const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!m) return null;
	const startRaw = m[1];
	const endRaw = m[2];
	if (startRaw === '' && endRaw === '') return null;
	if (total <= 0) return null;
	if (startRaw === '') {
		const suffix = Number(endRaw);
		if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
		const length = Math.min(suffix, total);
		return { offset: total - length, length };
	}
	const start = Number(startRaw);
	if (!Number.isSafeInteger(start) || start >= total) return null;
	let end = endRaw === '' ? total - 1 : Number(endRaw);
	if (!Number.isSafeInteger(end)) return null;
	if (end >= total) end = total - 1;
	if (end < start) return null;
	return { offset: start, length: end - start + 1 };
}

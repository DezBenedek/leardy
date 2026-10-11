import type { LessonPage } from './curriculum';

export interface LessonDocument { lessonPage: LessonPage; quizVersion: string; contentVersion: number }
export const CONTENT_CACHE = 'leardy-content-v2';
export const PRIVATE_CACHE_PREFIX = 'leardy-private-v2:';
export const PRIVATE_APP_CACHE_PREFIX = 'leardy-offline-api-v1:';
export const CONTENT_EVENT = 'leardy-content';
export const IDENTITY_KEY = 'leardy-offline-user-v1';

export interface ContentMessage {
	type: 'content-updated' | 'content-deleted' | 'content-invalidated' | 'content-status';
	url?: string;
	offline?: boolean;
	reason?: 'resume';
}

export function contentUrl(raw: string, origin: string): string {
	const url = new URL(raw, origin);
	url.hash = '';
	url.searchParams.sort();
	return url.href;
}

export function isContentUrl(url: URL): boolean {
	return url.pathname === '/api/browse' || url.pathname === '/api/packages' || /^\/api\/lessons\/[^/]+$/.test(url.pathname);
}

export function isLearningPath(pathname: string): boolean {
	return /^\/tanulas(?:\/lecke\/[^/]+)?\/?$/.test(pathname);
}

export function isOfflinePath(pathname: string): boolean {
	return pathname === '/' || pathname === '/beallitasok' || isLearningPath(pathname)
		|| /^\/kartyak(?:\/[^/]+)?\/?$/.test(pathname) || /^\/tantargy\/[^/]+\/?$/.test(pathname)
		|| /^\/szavak\/[^/]+\/?$/.test(pathname)
		|| /^\/tanterem(?:\/[^/]+(?:\/(?:feladat|beadando)\/[^/]+)?)?\/?$/.test(pathname);
}

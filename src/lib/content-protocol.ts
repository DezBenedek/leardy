import type { LessonPage } from './curriculum';

export interface LessonDocument { lessonPage: LessonPage; quizVersion: string; contentVersion: number }
export const CONTENT_CACHE = 'leardy-content-v2';
export const PRIVATE_CACHE_PREFIX = 'leardy-private-v2:';
export const CONTENT_EVENT = 'leardy-content';
export const IDENTITY_KEY = 'leardy-offline-user-v1';

export interface ContentMessage {
	type: 'content-updated' | 'content-deleted' | 'content-invalidated' | 'content-status';
	url?: string;
	offline?: boolean;
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

export function offlineUrl(target: URL): string {
	const lesson = /^\/tanulas\/lecke\/([^/]+)\/?$/.exec(target.pathname);
	const params = new URLSearchParams();
	if (lesson) params.set('lesson', decodeURIComponent(lesson[1]));
	if (target.hash) params.set('section', target.hash.slice(1));
	return `/offline${params.size ? `?${params}` : ''}`;
}

import type { HandleClientError } from '@sveltejs/kit';
import { offlineUrl } from '$lib/content-protocol';

export const handleError: HandleClientError = ({ error, event }) => {
	if ((error instanceof TypeError || !navigator.onLine) && /^\/tanulas(?:\/lecke\/[^/]+)?\/?$/.test(event.url.pathname)) {
		location.replace(offlineUrl(event.url));
	}
	return { message: 'Az oldal most nem tölthető be.' };
};

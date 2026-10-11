import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = () => {
	return { message: 'Az oldal most nem tölthető be.' };
};

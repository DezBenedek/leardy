import { browser } from '$app/environment';
import { loadSession } from '$lib/session-client';
import type { LayoutLoad } from './$types';

/** Hálózathiba esetén a helyben megőrzött fiókkal folytatjuk. */
export const load: LayoutLoad = async ({ fetch, depends }) => {
	depends('app:session');
	return loadSession(fetch, !browser || navigator.onLine);
};

import { browser } from '$app/environment';
import type { User } from '$lib/auth.svelte';
import type { LayoutLoad } from './$types';

/** A Tanulás útvonalai szerveres oldaladat nélkül is megnyithatók. */
export const load: LayoutLoad = async ({ fetch, depends }) => {
	depends('app:session');
	if (browser && !navigator.onLine) return { user: null, isEditor: false, offline: true };
	try {
		const response = await fetch('/api/auth/me', { cache: 'no-store' });
		if (response.status >= 500) throw new Error('Nincs kapcsolat a szerverrel.');
		const result = response.ok ? await response.json() : null;
		return { user: (result?.user ?? null) as User | null, isEditor: !!result?.isEditor, offline: false };
	} catch {
		return { user: null, isEditor: false, offline: true };
	}
};

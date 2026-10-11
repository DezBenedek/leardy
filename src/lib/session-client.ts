import { offlineIdentity } from './content-client';
import type { User } from './auth.svelte';

export function offlineSession() {
	const remembered = offlineIdentity();
	return {
		user: remembered ? { ...remembered, email: remembered.email ?? '' } as User : null,
		isEditor: remembered?.isEditor ?? false,
		offline: true
	};
}

/** Csak a szerver kifejezett elutasítása jelent kijelentkezett állapotot. */
export async function loadSession(fetcher: typeof fetch, online = true) {
	if (!online) return offlineSession();
	try {
		const response = await fetcher('/api/auth/me', { cache: 'no-store' });
		if (response.status === 401 || response.status === 403) return { user: null, isEditor: false, offline: false };
		if (!response.ok) return offlineSession();
		const result = await response.json();
		if (!result.user?.id || typeof result.user.name !== 'string') return offlineSession();
		return { user: result.user as User, isEditor: !!result.isEditor, offline: false };
	} catch { return offlineSession(); }
}

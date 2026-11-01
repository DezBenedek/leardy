import { byteSize } from './settings-ui';

export interface StorageInfo {
	lib: number;
	scope: number;
	seen: number;
	total: number;
}

export function emptyStorageInfo(): StorageInfo {
	return { lib: 0, scope: 0, seen: 0, total: 0 };
}

export function refreshStorageInfo(): StorageInfo {
	if (typeof localStorage === 'undefined') return emptyStorageInfo();
	try {
		let seen = 0;
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i) ?? '';
			if (k.startsWith('leardy-seen-') || k.startsWith('leardy-reminder-') || k.startsWith('leardy-notif-')) {
				seen += byteSize(localStorage.getItem(k));
			}
		}
		const lib = byteSize(localStorage.getItem('leardy-library'));
		const scope = byteSize(localStorage.getItem('leardy-scope'));
		return { lib, scope, seen, total: lib + scope + seen };
	} catch {
		return emptyStorageInfo();
	}
}

export function clearOfflineLibrary(): void {
	localStorage.removeItem('leardy-library');
}

export function clearAllCache(): void {
	const keepSettings = localStorage.getItem('leardy-settings');
	const keepTheme = localStorage.getItem('leardy-theme');
	const keepWhats = localStorage.getItem('leardy-whatsnew-seen');
	const keys: string[] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (k && k.startsWith('leardy-')) keys.push(k);
	}
	for (const k of keys) {
		if (k === 'leardy-settings' || k === 'leardy-theme' || k === 'leardy-whatsnew-seen') continue;
		localStorage.removeItem(k);
	}
	if (keepSettings !== null) localStorage.setItem('leardy-settings', keepSettings);
	if (keepTheme !== null) localStorage.setItem('leardy-theme', keepTheme);
	if (keepWhats !== null) localStorage.setItem('leardy-whatsnew-seen', keepWhats);
}

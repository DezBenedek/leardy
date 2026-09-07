// Téma-kezelés a régi themeModeProvider alapján: rendszer / világos / sötét.
import type { ThemeMode } from './db.svelte.js';

export type { ThemeMode };

const KEY = 'leardy-theme';

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
	if (mode === 'light') return 'light';
	if (mode === 'dark') return 'dark';
	if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches) {
		return 'dark';
	}
	return 'light';
}

/** localStorage + <html> szinkron. Minden témaváltás ezen át menjen. */
export function applyTheme(mode: ThemeMode) {
	try {
		localStorage.setItem(KEY, mode);
	} catch {
		/* privát mód */
	}
	document.documentElement.classList.toggle('dark', resolveTheme(mode) === 'dark');
}

export function storedTheme(): ThemeMode {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
	} catch {
		/* privát mód */
	}
	return 'system';
}

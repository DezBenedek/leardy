import { browser } from '$app/environment';

/* Oldal-szűrők memóriája (localStorage: leardy-scope).
   Kártyák, Felfedezés, Tanulás és a tananyag-szerkesztő megjegyzi az utolsó tantárgy/tananyag (/fül) választást,
   újranyitáskor azt tölti be. Érvénytelen id esetén az elsőre esik vissza. */

export interface PageScope {
	subject: string;
	level: string;
	tab?: string;
}

const KEY = 'leardy-scope';

function empty(): PageScope {
	return { subject: '', level: '' };
}

export function loadScope(page: string): PageScope {
	if (!browser) return empty();
	try {
		const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, PageScope>;
		const s = all[page];
		if (!s || typeof s !== 'object') return empty();
		return {
			subject: typeof s.subject === 'string' ? s.subject : '',
			level: typeof s.level === 'string' ? s.level : '',
			tab: typeof s.tab === 'string' ? s.tab : undefined
		};
	} catch {
		return empty();
	}
}

export function saveScope(page: string, scope: PageScope): void {
	if (!browser) return;
	try {
		const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, PageScope>;
		all[page] = { subject: scope.subject, level: scope.level, tab: scope.tab };
		localStorage.setItem(KEY, JSON.stringify(all));
	} catch {
		// tiltott storage: nincs mit tenni
	}
}

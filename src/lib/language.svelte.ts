import { browser } from '$app/environment';
import type { LangCode } from './languages';

const KEY = 'leardy-lang';

class LanguageStore {
	code = $state<LangCode>('en');

	constructor() {
		if (!browser) return;
		try {
			const saved = localStorage.getItem(KEY);
			if (saved === 'en' || saved === 'de' || saved === 'it' || saved === 'es') {
				this.code = saved;
			}
		} catch {
			// tiltott storage: marad az angol
		}
	}

	set(code: LangCode) {
		this.code = code;
		try {
			localStorage.setItem(KEY, code);
		} catch {
			// nincs mit tenni
		}
	}
}

export const language = new LanguageStore();

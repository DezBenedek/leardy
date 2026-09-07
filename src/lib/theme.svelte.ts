import { browser } from '$app/environment';

export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'leardy-theme';

class ThemeStore {
	choice = $state<ThemeChoice>('light');
	private systemDark = $state(false);

	constructor() {
		if (!browser) return;
		try {
			const saved = localStorage.getItem(KEY);
			if (saved === 'light' || saved === 'dark' || saved === 'system') {
				this.choice = saved;
			}
		} catch {
			// tiltott storage: marad a világos
		}
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		this.systemDark = mq.matches;
		mq.addEventListener('change', (e) => {
			this.systemDark = e.matches;
			this.apply();
		});
		this.apply();
	}

	get isDark(): boolean {
		return this.choice === 'dark' || (this.choice === 'system' && this.systemDark);
	}

	set(choice: ThemeChoice) {
		this.choice = choice;
		this.apply();
	}

	private apply() {
		if (!browser) return;
		const dark = this.isDark;
		document.documentElement.classList.toggle('dark', dark);
		try {
			localStorage.setItem(KEY, this.choice);
		} catch {
			// nincs mit tenni
		}
		const meta = document.querySelector('meta[name="theme-color"]');
		if (meta) meta.setAttribute('content', dark ? '#0c0a09' : '#ffffff');
	}
}

export const theme = new ThemeStore();

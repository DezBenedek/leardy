import { browser } from '$app/environment';

export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'leardy-theme';

class ThemeStore {
	choice = $state<ThemeChoice>('system');
	private systemDark = $state(false);

	constructor() {
		if (!browser) return;
		try {
			const saved = localStorage.getItem(KEY);
			if (saved === 'light' || saved === 'dark' || saved === 'system') {
				this.choice = saved;
			}
		} catch {
			// tiltott storage: marad a rendszer
		}
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		this.systemDark = mq.matches;
		mq.addEventListener('change', (e) => {
			this.systemDark = e.matches;
			this.apply();
		});
		// Másik fülön váltott téma átvétele.
		window.addEventListener('storage', (e) => {
			if (e.key !== KEY) return;
			if (e.newValue === 'light' || e.newValue === 'dark' || e.newValue === 'system') {
				this.choice = e.newValue;
				this.apply();
			}
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
		document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
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

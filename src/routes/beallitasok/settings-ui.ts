import { Moon, Smartphone, Sun } from '@lucide/svelte';
import type { ThemeChoice } from '$lib/state/theme.svelte';

export type Sheet = null | 'account' | 'notif' | 'theme' | 'learning' | 'storage' | 'about' | 'developer';
export type AccountEdit = null | 'name';

export const inputCls =
	'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:ring-brand-500/20';

export const primaryCls =
	'inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-500 px-5 py-2.5 text-[15px] font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-60 dark:shadow-black/30';

export const tile =
	'grid size-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-white';

export const sheetTitles: Record<Exclude<Sheet, null>, string> = {
	account: 'Fiók',
	notif: 'Értesítések',
	theme: 'Megjelenés',
	learning: 'Tanulás',
	storage: 'Tárhely',
	about: 'Névjegy',
	developer: 'Fejlesztői beállítások'
};

export const accountEditTitles: Record<Exclude<AccountEdit, null>, string> = {
	name: 'Név módosítása'
};

export const themeOptions: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
	{ id: 'light', label: 'Világos', icon: Sun },
	{ id: 'dark', label: 'Sötét', icon: Moon },
	{ id: 'system', label: 'Rendszer', icon: Smartphone }
];

export function fontFamilyLabel(f: string): string {
	return f === 'modern' ? 'Modern' : f === 'book' ? 'Könyvszerű' : f === 'excalifont' ? 'Excalifont' : 'Rendszer';
}

export function byteSize(v: string | null): number {
	if (!v) return 0;
	try {
		return new Blob([v]).size;
	} catch {
		return v.length;
	}
}

export function fmtBytes(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return '0 B';
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function formatKeyDate(ts: number | null): string {
	if (!ts) return 'még nem használt';
	try {
		return new Date(ts).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' });
	} catch {
		return 'ismeretlen';
	}
}

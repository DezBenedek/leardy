import {
	ArrowDownAZ,
	BookOpenText,
	History,
	Landmark,
	Languages,
	Layers,
	Leaf
} from '@lucide/svelte';
import type { LibSortOption } from './library-format';

export const subjectIcons: Record<string, typeof Landmark> = {
	landmark: Landmark,
	leaf: Leaf,
	languages: Languages,
	book: BookOpenText
};

export const pickRowBtn =
	'flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 text-left transition hover:bg-stone-50 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5';
export const optRowBtn =
	'flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100';
export const optTile = (selected: boolean) =>
	[
		'grid size-9 shrink-0 place-items-center rounded-xl',
		selected
			? 'bg-brand-500 text-white'
			: 'bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300'
	].join(' ');

export const libSortOptions: LibSortOption[] = [
	{ id: 'recent', title: 'Legutóbb megnyitott', desc: 'A frissen megnyitott elöl', icon: History },
	{ id: 'name', title: 'Név szerint', desc: 'A-tól Z-ig', icon: ArrowDownAZ },
	{ id: 'cards', title: 'Kártyaszám szerint', desc: 'A legtöbb kártya elöl', icon: Layers }
];

export const cardInput =
	'min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 motion-reduce:transition-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500';

/** Az új csomag űrlapján a tananyag-címke a választott tantárgytól függ. */
export const dLevelLabel = 'Tananyag';
export const filterLevelLabel = 'Tananyag';

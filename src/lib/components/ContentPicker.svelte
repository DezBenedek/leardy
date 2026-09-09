<script module lang="ts">
	export type PickerKind = 'topic' | 'lesson' | 'deck' | 'quiz';

	export interface PickedRef {
		kind: PickerKind;
		id: string;
		title: string;
		parentId?: string;
		parentTitle?: string;
	}
</script>

<script lang="ts">
	import { ArrowLeft, BookOpenText, Check, ChevronRight, ClipboardList, FolderOpen, Layers, Search } from '@lucide/svelte';
	import Drawer from './Drawer.svelte';
	import type { AssessmentRow, LessonRow, MyTopic, Topic } from '$lib/study';

	interface Props {
		open: boolean;
		kind: PickerKind;
		title: string;
		topics?: Topic[];
		decks?: MyTopic[];
		quizzes?: AssessmentRow[];
		/** Több is jelölhető (deck / quiz módban). */
		multiple?: boolean;
		selected?: string[];
		loadLessons?: (topicId: string) => Promise<LessonRow[]>;
		onSelect?: (v: PickedRef) => void;
		onMulti?: (ids: string[]) => void;
		onClose: () => void;
	}

	let {
		open,
		kind,
		title,
		topics = [],
		decks = [],
		quizzes = [],
		multiple = false,
		selected = [],
		loadLessons,
		onSelect,
		onMulti,
		onClose
	}: Props = $props();

	let q = $state('');
	let navTopic = $state<{ id: string; title: string } | null>(null);
	let lessons = $state<LessonRow[]>([]);
	let lessonsBusy = $state(false);
	let multi = $state<string[]>([]);

	// Nyitáskor tiszta állapot.
	$effect(() => {
		if (open) {
			q = '';
			navTopic = null;
			lessons = [];
			multi = [...selected];
		}
	});

	let needle = $derived(q.trim().toLowerCase());
	function match(hay: string): boolean {
		return needle === '' || hay.toLowerCase().includes(needle);
	}

	let shownTopics = $derived(topics.filter((t) => match(`${t.title} ${t.category ?? ''}`)));
	let shownLessons = $derived(lessons.filter((l) => match(l.title)));
	let shownDecks = $derived(decks.filter((d) => match(`${d.title} ${d.category ?? ''}`)));
	let shownQuizzes = $derived(quizzes.filter((x) => match(x.title)));

	async function drill(t: Topic) {
		navTopic = { id: t.id, title: t.title };
		lessons = [];
		lessonsBusy = true;
		try {
			lessons = (await loadLessons?.(t.id)) ?? [];
		} finally {
			lessonsBusy = false;
		}
	}

	function toggleMulti(id: string) {
		multi = multi.includes(id) ? multi.filter((x) => x !== id) : [...multi, id];
	}

	function multiTitle(id: string): string {
		return decks.find((d) => d.id === id)?.title ?? quizzes.find((x) => x.id === id)?.title ?? '';
	}

	const row =
		'flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition active:scale-[0.99] hover:bg-stone-100 dark:hover:bg-white/5';
</script>

<Drawer open={open} label={title} wide onClose={onClose}>
	<div class="px-5 pt-1 pb-5 sm:px-6 sm:pb-6">
		<div class="flex items-center gap-2">
			{#if kind === 'lesson' && navTopic}
				<button
					onclick={() => {
						navTopic = null;
						lessons = [];
					}}
					aria-label="Vissza a témakörökhöz"
					class="grid size-9 shrink-0 place-items-center rounded-full border border-stone-200 text-ink-600 transition hover:bg-stone-50 active:scale-95 dark:border-white/10 dark:text-stone-300"
				>
					<ArrowLeft size={17} />
				</button>
			{/if}
			<h2 class="font-display min-w-0 flex-1 truncate text-[22px] font-bold tracking-tight text-ink-900 dark:text-white">
				{kind === 'lesson' && navTopic ? navTopic.title : title}
			</h2>
		</div>
		{#if kind === 'lesson' && !navTopic}
			<p class="mt-0.5 text-[13px] text-stone-500 dark:text-stone-400">Előbb témakör, koppintásra jönnek a leckék.</p>
		{/if}

		<div class="relative mt-3">
			<Search size={17} class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-400" />
			<input
				bind:value={q}
				type="search"
				placeholder="Keresés…"
				autocomplete="off"
				aria-label="Keresés"
				class="w-full rounded-xl border border-stone-300 bg-white py-2.5 pr-3 pl-10 text-[14px] text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
			/>
		</div>

		<div class="mt-2 max-h-[46dvh] space-y-1 overflow-y-auto overscroll-contain pb-1">
			{#if kind === 'topic'}
				{#each shownTopics as t (t.id)}
					<button
						onclick={() => onSelect?.({ kind: 'topic', id: t.id, title: t.title })}
						class={row}
					>
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
							<FolderOpen size={19} />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{t.title}</span>
							<span class="block truncate text-[13px] text-stone-500 dark:text-stone-400">
								{t.category ? `${t.category} · ` : ''}{t.lessons ?? 0} lecke
							</span>
						</span>
						<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
					</button>
				{:else}
					<p class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">Nincs találat.</p>
				{/each}
			{:else if kind === 'lesson'}
				{#if !navTopic}
					{#each shownTopics as t (t.id)}
						<button onclick={() => void drill(t)} class={row}>
							<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white">
								<BookOpenText size={19} />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{t.title}</span>
								<span class="block truncate text-[13px] text-stone-500 dark:text-stone-400">
									{t.category ? `${t.category} · ` : ''}{t.lessons ?? 0} lecke
								</span>
							</span>
							<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
						</button>
					{:else}
						<p class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">Nincs találat.</p>
					{/each}
				{:else if lessonsBusy}
					<p class="animate-pulse p-6 text-center text-sm text-stone-500">Leckék betöltése…</p>
				{:else}
					{@const nt = navTopic}
					{#each shownLessons as l (l.id)}
						<button
							onclick={() => nt && onSelect?.({ kind: 'lesson', id: l.id, title: l.title, parentId: nt.id, parentTitle: nt.title })}
							class={row}
						>
							<span class="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-900 dark:text-white">{l.title}</span>
							<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
						</button>
					{:else}
						<p class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">
							{needle ? 'Nincs találat.' : 'Ebben a témakörben nincs lecke.'}
						</p>
					{/each}
				{/if}
			{:else if kind === 'deck'}
				{#each shownDecks as d (d.id)}
					{@const on = multi.includes(d.id)}
					<button
						onclick={() => (multiple ? toggleMulti(d.id) : onSelect?.({ kind: 'deck', id: d.id, title: d.title }))}
						aria-pressed={multiple ? on : undefined}
						class={[row, multiple && on ? 'bg-brand-50 dark:bg-brand-500/10' : '']}
					>
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
							<Layers size={19} />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{d.title}</span>
							<span class="block truncate text-[13px] text-stone-500 dark:text-stone-400">{d.category ? `${d.category} · ` : ''}kártyacsomag</span>
						</span>
						{#if multiple}
							<span class={['grid size-6 shrink-0 place-items-center rounded-lg border-2 transition', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-stone-300 text-transparent dark:border-white/20']}>
								<Check size={15} strokeWidth={3.5} />
							</span>
						{:else}
							<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
						{/if}
					</button>
				{:else}
					<p class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">
						Még nincs kártyacsomagod — készíts a Kártyák oldalon!
					</p>
				{/each}
			{:else}
				{#each shownQuizzes as x (x.id)}
					{@const on = multiple && multi.includes(x.id)}
					<button
						onclick={() => (multiple ? toggleMulti(x.id) : onSelect?.({ kind: 'quiz', id: x.id, title: x.title }))}
						aria-pressed={multiple ? on : undefined}
						class={[row, multiple && on ? 'bg-brand-50 dark:bg-brand-500/10' : '']}
					>
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white">
							<ClipboardList size={19} />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{x.title}</span>
							<span class="block truncate text-[13px] text-stone-500 tabular-nums dark:text-stone-400">{x.items} kérdés</span>
						</span>
						{#if multiple}
							<span class={['grid size-6 shrink-0 place-items-center rounded-lg border-2 transition', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-stone-300 text-transparent dark:border-white/20']}>
								<Check size={15} strokeWidth={3.5} />
							</span>
						{:else}
							<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
						{/if}
					</button>
				{:else}
					<p class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">
						Még nincs kvízed — készíts a Kvízek oldalon!
					</p>
				{/each}
			{/if}
		</div>

		{#if multiple}
			{#if multi.length > 0}
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each multi as id (id)}
						<button
							onclick={() => toggleMulti(id)}
							title="Eltávolítás"
							class="inline-flex max-w-full items-center gap-1 rounded-full bg-ink-900 py-1 pr-2 pl-3 text-[12px] font-bold text-white dark:bg-white dark:text-ink-900"
						>
							<span class="truncate">{multiTitle(id)}</span> ✕
						</button>
					{/each}
				</div>
			{/if}
			<button
				onclick={() => onMulti?.([...multi])}
				disabled={multi.length === 0}
				class="mt-3 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
			>
				Kész{multi.length > 0 ? ` (${multi.length})` : ''}
			</button>
		{/if}
	</div>
</Drawer>

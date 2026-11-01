<script lang="ts">
	import { BookOpen, Minus, Plus } from '@lucide/svelte';
	import type { LessonRef, LevelNode, MaterialNode } from '$lib/curriculum/curriculum';

	interface Props {
		results: { le: LessonRef; m: MaterialNode; l: LevelNode; global: boolean }[];
		multi: boolean;
		query: string;
		onlyWithQuiz: boolean;
		quizCountOf: (lessonId: string) => number;
		isPicked: (id: string) => boolean;
		onTap: (l: LevelNode, m: MaterialNode, le: LessonRef) => void;
		onToggle: (l: LevelNode, m: MaterialNode, le: LessonRef) => void;
	}

	let {
		results,
		multi,
		query,
		onlyWithQuiz,
		quizCountOf,
		isPicked,
		onTap,
		onToggle
	}: Props = $props();

	const rowBtn =
		'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100';
	const rowTile =
		'grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300';
	const rowTileSel = 'grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-white';
	const pillRow = (sel: boolean) =>
		[
			'flex items-center gap-1 rounded-2xl p-1 pr-1.5 transition',
			sel ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5'
		].join(' ');
	const toggleBtn = (sel: boolean) =>
		[
			'grid size-9 shrink-0 place-items-center rounded-full border transition active:scale-90',
			sel
				? 'border-brand-500 bg-brand-500 text-white'
				: 'border-stone-300 text-stone-500 hover:bg-white dark:border-white/20 dark:text-stone-300 dark:hover:bg-white/10'
		].join(' ');
</script>

<ul class="-mx-1 mt-2 space-y-0.5">
	{#if results.length === 0}
		<li>
			<p class="p-2 text-sm text-stone-500 dark:text-stone-400">
				{query.trim()
					? 'Nincs ilyen találat.'
					: onlyWithQuiz
						? 'Nincs kvízes lecke.'
						: 'Nincs megjeleníthető lecke.'}
			</p>
		</li>
	{:else}
		{#each results as { le, m, l, global } (le.id)}
			{@const sel = multi && isPicked(le.id)}
			{@const qc = quizCountOf(le.id)}
			<li class={pillRow(sel)}>
				<button type="button" onclick={() => onTap(l, m, le)} class={rowBtn}>
					<span class={sel ? rowTileSel : rowTile}>
						<BookOpen size={18} aria-hidden="true" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
							{le.title}
						</span>
						<span class="block truncate text-[12px] font-medium text-stone-500 dark:text-stone-400">
							{#if global}{m.title}{:else if qc > 0}{qc} kvíz{/if}
						</span>
					</span>
				</button>
				{#if multi}
					<button
						type="button"
						aria-label={sel ? 'Lecke kivétele' : 'Lecke hozzáadása'}
						aria-pressed={sel}
						onclick={() => onToggle(l, m, le)}
						class={toggleBtn(sel)}
					>
						{#if sel}<Minus size={16} strokeWidth={3} />{:else}<Plus size={16} strokeWidth={3} />{/if}
					</button>
				{/if}
			</li>
		{/each}
	{/if}
</ul>

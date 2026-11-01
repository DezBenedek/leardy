<script lang="ts">
	import { BookOpen, Minus, Plus } from '@lucide/svelte';
	import type { LevelNode, MaterialNode } from '$lib/curriculum/curriculum';

	interface Props {
		results: { m: MaterialNode; l: LevelNode }[];
		select: 'lesson' | 'topic' | 'level';
		multi: boolean;
		query: string;
		onlyWithQuiz: boolean;
		isPicked: (id: string) => boolean;
		onTap: (l: LevelNode, m: MaterialNode) => void;
		onToggle: (l: LevelNode, m: MaterialNode) => void;
	}

	let {
		results,
		select,
		multi,
		query,
		onlyWithQuiz,
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
						? 'Nincs kvízes témakör.'
						: 'Nincs megjeleníthető témakör.'}
			</p>
		</li>
	{:else}
		{#each results as { m, l } (m.id)}
			{@const sel = select === 'topic' && multi && isPicked(m.id)}
			<li class={pillRow(sel)}>
				<button type="button" onclick={() => onTap(l, m)} class={rowBtn}>
					<span class={sel ? rowTileSel : rowTile}>
						<BookOpen size={18} aria-hidden="true" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
							{m.title}
						</span>
						<span class="block truncate text-[12px] font-medium text-stone-500 dark:text-stone-400">
							{m.lessons.length} lecke
						</span>
					</span>
				</button>
				{#if select === 'topic' && multi}
					<button
						type="button"
						aria-label={sel ? 'Témakör kivétele' : 'Témakör hozzáadása'}
						aria-pressed={sel}
						onclick={() => onToggle(l, m)}
						class={toggleBtn(sel)}
					>
						{#if sel}<Minus size={16} strokeWidth={3} />{:else}<Plus size={16} strokeWidth={3} />{/if}
					</button>
				{/if}
			</li>
		{/each}
	{/if}
</ul>

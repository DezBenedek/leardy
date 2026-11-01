<script lang="ts">
	import {
		BookOpenText,
		Check,
		ChevronRight,
		Landmark,
		Languages,
		Leaf,
		Shapes
	} from '@lucide/svelte';
	import type { Subject } from '$lib/curriculum/curriculum';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import PickerSkeletons from './PickerSkeletons.svelte';

	interface Props {
		subjects: Subject[];
		select: 'lesson' | 'topic' | 'level';
		selectedSubjectId: string;
		loadingTree: boolean;
		pendingSubjectId: string;
		loadingSubjectCounts: boolean;
		onlyWithQuiz: boolean;
		query: string;
		tutorialActive: boolean;
		direction: number;
		animate: boolean;
		onChoose: (s: Subject) => void;
	}

	let {
		subjects,
		select,
		selectedSubjectId,
		loadingTree,
		pendingSubjectId,
		loadingSubjectCounts,
		onlyWithQuiz,
		query,
		tutorialActive,
		direction,
		animate,
		onChoose
	}: Props = $props();

	const subjectIcons: Record<string, typeof Landmark> = {
		landmark: Landmark,
		leaf: Leaf,
		languages: Languages,
		book: BookOpenText
	};

	const rowTile =
		'grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300';
	const rowTileSel = 'grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-white';
</script>

<ul in:fly={{ x: direction * 24, duration: select === 'level' && animate ? 220 : 0, easing: cubicOut }} class="-mx-1 mt-2 space-y-0.5">
	{#if onlyWithQuiz && loadingSubjectCounts}
		<PickerSkeletons />
	{:else if subjects.length === 0}
		<li>
			<p class="p-2 text-sm text-stone-500 dark:text-stone-400">
				{query.trim()
					? 'Nincs ilyen találat.'
					: onlyWithQuiz
						? 'Nincs kvízes tantárgy.'
						: 'Nincs megjeleníthető tantárgy.'}
			</p>
		</li>
	{:else}
		{#each subjects as s (s.id)}
			{@const SIcon = subjectIcons[s.icon] ?? Shapes}
			{@const current = select === 'level' && s.id === selectedSubjectId}
			<li>
				<button
					type="button"
					data-tutorial="scope-subject"
					onclick={() => void onChoose(s)}
					aria-busy={loadingTree && pendingSubjectId === s.id}
					disabled={(loadingTree && pendingSubjectId === s.id) || (tutorialActive && s.lessonCount === 0)}
					aria-pressed={select === 'level' ? current : undefined}
					class={['flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100', current ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={current ? rowTileSel : rowTile}>
						<SIcon size={18} aria-hidden="true" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
							{s.title}
						</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
							{select === 'level' ? `${s.levelCount} tananyag` : `${s.lessonCount} lecke`}
						</span>
					</span>
					{#if select === 'level'}
						{#if current}<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
						{:else}<ChevronRight size={17} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />{/if}
					{/if}
				</button>
			</li>
		{/each}
	{/if}
</ul>

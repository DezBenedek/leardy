<script lang="ts">
	import { BookOpen, Check, Plus } from '@lucide/svelte';
	import type { LevelNode, Subject, SubjectTree } from '$lib/curriculum/curriculum';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import PickerSkeletons from './PickerSkeletons.svelte';

	interface Props {
		levels: LevelNode[];
		levelLabel: string;
		select: 'lesson' | 'topic' | 'level';
		selectedLevelId: string;
		selectedSubjectId: string;
		includeAllLevels: boolean;
		subject: Subject | null;
		loadingTree: boolean;
		tree: SubjectTree | null;
		treeError: boolean;
		query: string;
		onlyWithQuiz: boolean;
		tutorialActive: boolean;
		direction: number;
		animate: boolean;
		levelNote?: (level: LevelNode) => string;
		onChooseLevel: (l: LevelNode) => void;
		onChooseAll: () => void;
		onRetry: () => void;
		onCreateLevel?: (subjectId: string) => void;
	}

	let {
		levels,
		levelLabel,
		select,
		selectedLevelId,
		selectedSubjectId,
		includeAllLevels,
		subject,
		loadingTree,
		tree,
		treeError,
		query,
		onlyWithQuiz,
		tutorialActive,
		direction,
		animate,
		levelNote,
		onChooseLevel,
		onChooseAll,
		onRetry,
		onCreateLevel
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
</script>

<ul in:fly={{ x: direction * 24, duration: select === 'level' && animate ? 220 : 0, easing: cubicOut }} class="-mx-1 mt-2 space-y-0.5">
	{#if includeAllLevels && select === 'level' && subject && !loadingTree}
		<li class={pillRow(selectedSubjectId === subject.id && selectedLevelId === '')}>
			<button type="button" onclick={onChooseAll} class={rowBtn} aria-pressed={selectedSubjectId === subject.id && selectedLevelId === ''}>
				<span class={rowTile}><BookOpen size={18} /></span>
				<span class="min-w-0 flex-1"><span class="block text-[15px] font-extrabold text-ink-900 dark:text-white">Minden tananyag</span><span class="block text-[12px] text-stone-500 dark:text-stone-400">A teljes tantárgy</span></span>
				{#if selectedSubjectId === subject.id && selectedLevelId === ''}<Check size={18} class="shrink-0 text-brand-600" />{/if}
			</button>
		</li>
	{/if}

	{#if loadingTree && !tree}
		<PickerSkeletons />
	{:else if treeError}
		<li class="p-2 text-sm text-stone-500 dark:text-stone-400">
			<p>Nem sikerült betölteni a tananyagokat.</p>
			<button type="button" onclick={onRetry} class="mt-2 rounded-xl px-3 py-2 font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-white/5">Újrapróbálás</button>
		</li>
	{:else if levels.length === 0}
		{#if query.trim() || !onCreateLevel}
			<li>
				<p class="p-2 text-center text-sm text-stone-500 dark:text-stone-400">
					{query.trim()
						? 'Nincs ilyen találat.'
						: onlyWithQuiz
							? `Nincs kvízes ${levelLabel.toLowerCase()}.`
							: `Nincs megjeleníthető ${levelLabel.toLowerCase()}.`}
				</p>
			</li>
		{/if}
	{:else}
		{#each levels as l (l.id)}
			{@const current = select === 'level' && l.id === selectedLevelId}
			<li>
				<button
					type="button"
					data-tutorial="scope-level"
					disabled={tutorialActive && !l.materials.some((m) => m.lessons.length > 0)}
					onclick={() => onChooseLevel(l)}
					aria-pressed={select === 'level' ? current : undefined}
					class={['flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100', current ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={[current ? rowTileSel : rowTile, 'text-[15px] font-extrabold'].join(' ')}>
						{l.title.trim().charAt(0).toUpperCase()}
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
							{l.title}
						</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
							{l.materials.length} témakör
							{#if levelNote} · {levelNote(l)}{/if}
						</span>
					</span>
					{#if current}<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />{/if}
				</button>
			</li>
		{/each}
	{/if}
	{#if onCreateLevel && subject && !loadingTree}
		<li>
			<button type="button" onclick={() => onCreateLevel?.(subject!.id)} class="flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition hover:bg-stone-100 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 dark:hover:bg-white/5">
				<span class={rowTile}><Plus size={18} /></span>
				<span class="min-w-0 flex-1"><span class="block text-[15px] font-extrabold text-ink-900 dark:text-white">Új {levelLabel.toLowerCase()}</span><span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Saját tananyag létrehozása</span></span>
			</button>
		</li>
	{/if}
</ul>

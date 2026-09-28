<script lang="ts">
	import { BookOpenText, Check, ChevronDown, Landmark, Languages, Layers, Leaf, Shapes } from '@lucide/svelte';
	import type { LevelNode, Subject } from '$lib/curriculum';
	import Sheet from '$lib/ui/Sheet.svelte';

	/* Tantárgy + Szint választó: két vékony kártya egymás mellett,
	   Sheet-tel nyíló opciólistával. (Tanulás és Kártyák oldalon közös.) */

	interface Props {
		subjects: Subject[];
		levels: LevelNode[];
		subjectId?: string;
		levelId?: string;
		/** Ha meg van adva, a tantárgy-lista elejére "Összes" sor kerül. */
		subjectAllLabel?: string;
	}

	let {
		subjects,
		levels,
		subjectId = $bindable(''),
		levelId = $bindable(''),
		subjectAllLabel
	}: Props = $props();

	let picker = $state<'subject' | 'level' | null>(null);

	const subjectIcons: Record<string, typeof Landmark> = {
		landmark: Landmark,
		leaf: Leaf,
		languages: Languages,
		book: BookOpenText
	};

	let activeSubject = $derived(subjects.find((s) => s.id === subjectId) ?? subjects[0] ?? null);
	let showAllSubjects = $derived(!!subjectAllLabel && !subjectId);
	/** A szint-választó címkéje a választott tantárgytól függ ("Szint", "Évfolyam", ...). */
	let levelLabel = $derived(showAllSubjects ? 'Szint' : activeSubject?.levelLabel || 'Szint');
	let levelLabelLow = $derived(levelLabel.toLowerCase());
	let activeLevelTitle = $derived(
		levelId ? (levels.find((l) => l.id === levelId)?.title ?? levelLabel) : `Minden ${levelLabelLow}`
	);

	const pickerBtn =
		'flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-left transition hover:bg-stone-50 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5';

	const rowBtn =
		'flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100';
	const rowTile = (selected: boolean) =>
		[
			'grid size-9 shrink-0 place-items-center rounded-xl',
			selected
				? 'bg-brand-500 text-white'
				: 'bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300'
		].join(' ');
</script>

<div class="grid min-w-0 flex-1 grid-cols-2 gap-2">
	<button type="button" class={pickerBtn} aria-haspopup="dialog" onclick={() => (picker = 'subject')}>
		<span class="min-w-0 flex-1">
			<span class="block text-[11px] font-bold tracking-wider text-stone-400 uppercase dark:text-stone-500">Tantárgy</span>
			<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
				{showAllSubjects ? subjectAllLabel : (activeSubject?.title ?? 'Választás')}
			</span>
		</span>
		<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
	</button>
	<button type="button" class={pickerBtn} aria-haspopup="dialog" onclick={() => (picker = 'level')}>
		<span class="min-w-0 flex-1">
			<span class="block text-[11px] font-bold tracking-wider text-stone-400 uppercase dark:text-stone-500">{levelLabel}</span>
			<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
				{activeLevelTitle}
			</span>
		</span>
		<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
	</button>
</div>

<Sheet open={picker === 'subject'} label="Tantárgy választása" title="Tantárgy" onClose={() => (picker = null)}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		{#if subjectAllLabel}
			<li>
				<button
					type="button"
					aria-pressed={subjectId === ''}
					onclick={() => {
						subjectId = '';
						picker = null;
					}}
					class={[rowBtn, subjectId === '' ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={rowTile(subjectId === '')}>
						<Layers size={18} aria-hidden="true" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{subjectAllLabel}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
							Minden tantárgy
						</span>
					</span>
					{#if subjectId === ''}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
		{/if}
		{#each subjects as s (s.id)}
			{@const SIcon = subjectIcons[s.icon] ?? Shapes}
			{@const selected = s.id === subjectId}
			<li>
				<button
					type="button"
					aria-pressed={selected}
					onclick={() => {
						subjectId = s.id;
						picker = null;
					}}
					class={[rowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={rowTile(selected)}>
						<SIcon size={18} aria-hidden="true" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{s.title}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
							{s.lessonCount} lecke
						</span>
					</span>
					{#if selected}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

<Sheet open={picker === 'level'} label="{levelLabel} választása" title={levelLabel} onClose={() => (picker = null)}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		<li>
			<button
				type="button"
				aria-pressed={levelId === ''}
				onclick={() => {
					levelId = '';
					picker = null;
				}}
				class={[rowBtn, levelId === '' ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={rowTile(levelId === '')}>
					<Layers size={18} aria-hidden="true" />
				</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Minden {levelLabelLow}</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">A teljes tantárgy</span>
				</span>
				{#if levelId === ''}
					<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
				{/if}
			</button>
		</li>
		{#each levels as l (l.id)}
			{@const selected = l.id === levelId}
			<li>
				<button
					type="button"
					aria-pressed={selected}
					onclick={() => {
						levelId = l.id;
						picker = null;
					}}
					class={[rowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={[rowTile(selected), 'text-[15px] font-extrabold'].join(' ')}>
						{l.title.trim().charAt(0).toUpperCase()}
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{l.title}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
							{l.materials.length} tananyag
						</span>
					</span>
					{#if selected}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

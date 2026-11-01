<script lang="ts">
	import { Check, Layers, Shapes } from '@lucide/svelte';
	import type { LevelNode, Subject } from '$lib/curriculum/curriculum';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { libSortOptions, optRowBtn, optTile, subjectIcons } from './library-ui';

	interface Props {
		fPicker: 'subject' | 'level' | 'sort' | null;
		onClose: () => void;
		subjectId: string;
		levelId: string;
		sortId: string;
		libSubjects: Subject[];
		libLevels: LevelNode[];
		libCountBySubject: Map<string, number>;
		libCountByLevel: Map<string, number>;
		filterLevelLabel: string;
		onSelectSubject: (v: string) => void;
		onSelectLevel: (v: string) => void;
		onSelectSort: (v: string) => void;
	}

	let {
		fPicker,
		onClose,
		subjectId,
		levelId,
		sortId,
		libSubjects,
		libLevels,
		libCountBySubject,
		libCountByLevel,
		filterLevelLabel,
		onSelectSubject,
		onSelectLevel,
		onSelectSort
	}: Props = $props();
</script>

<Sheet open={fPicker === 'subject'} label="Tantárgy választása" title="Tantárgy" {onClose}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		<li>
			<button
				type="button"
				aria-pressed={subjectId === ''}
				onclick={() => onSelectSubject('')}
				class={[optRowBtn, subjectId === '' ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={optTile(subjectId === '')}><Shapes size={18} aria-hidden="true" /></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Összes</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Minden tantárgy</span>
				</span>
				{#if subjectId === ''}
					<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
				{/if}
			</button>
		</li>
		{#each libSubjects as s (s.id)}
			{@const SIcon = subjectIcons[s.icon] ?? Shapes}
			{@const selected = s.id === subjectId}
			<li>
				<button
					type="button"
					aria-pressed={selected}
					onclick={() => onSelectSubject(selected ? '' : s.id)}
					class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={optTile(selected)}><SIcon size={18} aria-hidden="true" /></span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{s.title}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
							{libCountBySubject.get(s.id) ?? 0} csomag
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

<Sheet open={fPicker === 'level'} label="{filterLevelLabel} választása" title={filterLevelLabel} {onClose}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		<li>
			<button
				type="button"
				aria-pressed={levelId === ''}
				onclick={() => onSelectLevel('')}
				class={[optRowBtn, levelId === '' ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={optTile(levelId === '')}><Layers size={18} aria-hidden="true" /></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Mindegyik</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">A teljes választék</span>
				</span>
				{#if levelId === ''}
					<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
				{/if}
			</button>
		</li>
		{#each libLevels as l (l.id)}
			{@const selected = l.id === levelId}
			<li>
				<button
					type="button"
					aria-pressed={selected}
					onclick={() => onSelectLevel(selected ? '' : l.id)}
					class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={[optTile(selected), 'text-[15px] font-extrabold'].join(' ')}>
						{l.title.trim().charAt(0).toUpperCase()}
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{l.title}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
							{libCountByLevel.get(l.id) ?? 0} csomag
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

<Sheet open={fPicker === 'sort'} label="Rendezés választása" title="Rendezés" {onClose}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		{#each libSortOptions as o (o.id)}
			{@const Icon = o.icon}
			{@const selected = o.id === sortId}
			<li>
				<button
					type="button"
					aria-pressed={selected}
					onclick={() => onSelectSort(o.id)}
					class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={optTile(selected)}>
						<Icon size={18} aria-hidden="true" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{o.title}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">{o.desc}</span>
					</span>
					{#if selected}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

<script lang="ts">
	import { Check, Layers, Shapes } from '@lucide/svelte';
	import type { LevelNode, Subject } from '$lib/curriculum/curriculum';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { optRowBtn, optTile, subjectIcons } from './edit-ui';

	interface Props {
		picker: 'subject' | 'level' | null;
		onClose: () => void;
		subjectId: string;
		levelId: string;
		subjects: Subject[];
		levels: LevelNode[];
		levelLabel: string;
		levelLabelLow: string;
		onSubject: (v: string) => void;
		onLevel: (v: string) => void;
	}

	let {
		picker,
		onClose,
		subjectId,
		levelId,
		subjects,
		levels,
		levelLabel,
		levelLabelLow,
		onSubject,
		onLevel
	}: Props = $props();
</script>

<Sheet open={picker === 'subject'} label="Tantárgy választása" title="Tantárgy" {onClose}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		<li>
			<button
				type="button"
				onclick={() => {
					onSubject('');
				}}
				class={[optRowBtn, !subjectId ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={optTile(!subjectId)}><Shapes size={18} aria-hidden="true" /></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Válassz…</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Nincs besorolás</span>
				</span>
				{#if !subjectId}
					<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
				{/if}
			</button>
		</li>
		{#each subjects as s (s.id)}
			{@const SIcon = subjectIcons[s.icon] ?? Shapes}
			{@const selected = s.id === subjectId}
			<li>
				<button
					type="button"
					onclick={() => {
						onSubject(s.id);
					}}
					class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={optTile(selected)}><SIcon size={18} aria-hidden="true" /></span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{s.title}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">{s.packCount} csomag</span>
					</span>
					{#if selected}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

<Sheet open={picker === 'level'} label="{levelLabel} választása" title={levelLabel} {onClose}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		<li>
			<button
				type="button"
				onclick={() => {
					onLevel('');
				}}
				class={[optRowBtn, !levelId ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={optTile(!levelId)}><Layers size={18} aria-hidden="true" /></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Válassz…</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Nincs {levelLabelLow}</span>
				</span>
				{#if !levelId}
					<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
				{/if}
			</button>
		</li>
		{#each levels as l (l.id)}
			{@const selected = l.id === levelId}
			<li>
				<button
					type="button"
					onclick={() => {
						onLevel(l.id);
					}}
					class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={[optTile(selected), 'text-[15px] font-extrabold'].join(' ')}>
						{l.title.trim().charAt(0).toUpperCase()}
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{l.title}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">{l.materials.length} tananyag</span>
					</span>
					{#if selected}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

<script lang="ts">
	import { ChevronDown, FunnelX } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { pickRowBtn } from './library-ui';

	interface Props {
		open: boolean;
		onClose: () => void;
		filterSubjectTitle: string;
		filterLevelLabel: string;
		filterLevelTitle: string;
		filterSortTitle: string;
		activeFilterCount: number;
		origin: 'all' | 'mine' | 'saved';
		onPickSubject: () => void;
		onPickLevel: () => void;
		onPickSort: () => void;
		onOrigin: (v: 'all' | 'mine' | 'saved') => void;
		onReset: () => void;
	}

	let {
		open,
		onClose,
		filterSubjectTitle,
		filterLevelLabel,
		filterLevelTitle,
		filterSortTitle,
		activeFilterCount,
		origin,
		onPickSubject,
		onPickLevel,
		onPickSort,
		onOrigin,
		onReset
	}: Props = $props();
</script>

<Sheet {open} label="Szűrők és rendezés" {onClose}>
	<div class="mt-1 flex items-center gap-2">
		<h2 class="font-display min-w-0 flex-1 text-[20px] leading-snug font-extrabold tracking-tight text-ink-900 dark:text-white">
			Szűrők
		</h2>
		{#if activeFilterCount > 0}
			<Button variant="outline" size="sm" onclick={onReset}>
				<FunnelX size={16} aria-hidden="true" /> Szűrők törlése
			</Button>
		{/if}
	</div>
	<div class="mt-2 grid gap-2">
		<button type="button" onclick={onPickSubject} aria-haspopup="dialog" class={pickRowBtn}>
			<span class="min-w-0 flex-1">
				<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Tantárgy</span>
				<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
					{filterSubjectTitle}
				</span>
			</span>
			<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
		</button>
		<button type="button" onclick={onPickLevel} aria-haspopup="dialog" class={pickRowBtn}>
			<span class="min-w-0 flex-1">
				<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">{filterLevelLabel}</span>
				<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
					{filterLevelTitle}
				</span>
			</span>
			<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
		</button>
		<button type="button" onclick={onPickSort} aria-haspopup="dialog" class={pickRowBtn}>
			<span class="min-w-0 flex-1">
				<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Rendezés</span>
				<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
					{filterSortTitle}
				</span>
			</span>
			<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
		</button>
	</div>

	<p class="mt-4 text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Forrás</p>
	<div
		role="group"
		aria-label="Forrás szűrő"
		class="mt-1 grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-white/10"
	>
		{#each [{ id: 'all', label: 'Mind' }, { id: 'mine', label: 'Saját' }, { id: 'saved', label: 'Mentett' }] as o (o.id)}
			{@const selected = origin === o.id}
			<button
				type="button"
				aria-pressed={selected}
				onclick={() => onOrigin(o.id as typeof origin)}
				class={[
					'rounded-xl px-2 py-2 text-[13px] leading-none transition active:scale-[0.97]',
					selected
						? 'bg-white font-extrabold text-ink-900 shadow-sm dark:bg-stone-800 dark:text-white dark:shadow-black/40'
						: 'font-semibold text-stone-500 hover:text-ink-900 dark:text-stone-400 dark:hover:text-white'
				]}
			>
				{o.label}
			</button>
		{/each}
	</div>

</Sheet>

<script lang="ts">
	import type { SubjectColorKey } from '$lib/db.svelte.js';
	import { cn } from '$lib/utils.js';

	/** Tantárgy-fül a régi SubjectTab alapján: színes alap, nagybetűs felirat. */
	interface Props {
		label: string;
		colorKey: SubjectColorKey | 'all';
		selected: boolean;
		count: number;
		onTap: () => void;
	}

	let { label, colorKey, selected, count, onTap }: Props = $props();

	const wash = $derived(
		colorKey === 'all'
			? 'color-mix(in srgb, var(--graphite) 18%, transparent)'
			: `color-mix(in srgb, var(--subj-${colorKey}) 18%, transparent)`
	);
</script>

<button
	type="button"
	onclick={onTap}
	aria-pressed={selected}
	class={cn('press flex h-9 shrink-0 items-center gap-2 pr-3 pl-2.5', selected && 'hard-shadow')}
	style="background: {wash}"
>
	{#if selected}
		<span class="mr-0.5 h-[18px] w-[3px]" style="background: var(--primary)"></span>
	{/if}
	<span class="text-[12px] font-semibold tracking-[0.08em] uppercase">{label}</span>
	<span class="font-serif text-[13px] text-muted-foreground">{count}</span>
</button>

<style>
	/* tantárgy-színek a régi subjectColor leképezés alapján */
	button {
		--subj-ochre: var(--brass);
		--subj-slate: var(--rule);
		--subj-forest: var(--forest);
		--subj-wine: var(--wine);
	}
</style>

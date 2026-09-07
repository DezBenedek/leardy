<script lang="ts">
	import type { SubjectColorKey } from '$lib/db.svelte.js';
	import { cn } from '$lib/utils.js';

	/** Tantárgy-szűrő pill: színes pötty + felirat + darabszám. */
	interface Props {
		label: string;
		colorKey: SubjectColorKey | 'all';
		selected: boolean;
		count: number;
		onTap: () => void;
	}

	let { label, colorKey, selected, count, onTap }: Props = $props();

	const dot = $derived(
		colorKey === 'all'
			? 'var(--muted-foreground)'
			: `var(--subj-${colorKey})`
	);
</script>

<button
	type="button"
	onclick={onTap}
	aria-pressed={selected}
	class={cn(
		'press flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
		selected
			? 'border-primary/40 bg-primary/[0.08] text-foreground'
			: 'border-transparent bg-secondary/70 text-muted-foreground hover:text-foreground'
	)}
>
	<span class="size-2 shrink-0 rounded-full" style="background: {dot}"></span>
	{label}
	<span class={cn('rounded-full px-1.5 text-xs font-bold tabular-nums', selected ? 'text-primary' : 'text-muted-foreground/70')}>
		{count}
	</span>
</button>

<style>
	/* tantárgy-színek */
	button {
		--subj-ochre: var(--brass);
		--subj-slate: var(--rule);
		--subj-forest: var(--forest);
		--subj-wine: var(--wine);
	}
</style>

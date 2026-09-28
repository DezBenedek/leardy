<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		selected?: boolean;
		disabled?: boolean;
		ariaLabel?: string;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	}

	let { selected = false, disabled = false, ariaLabel, onclick, children }: Props = $props();
</script>

<button
	type="button"
	aria-pressed={selected}
	aria-label={ariaLabel}
	{disabled}
	{onclick}
	class={[
		'rounded-full px-4 py-2 text-sm font-semibold transition active:scale-[0.98]',
		'motion-reduce:transition-none motion-reduce:active:scale-100',
		'disabled:pointer-events-none disabled:opacity-50',
		selected
			? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900'
			: 'bg-stone-100 text-ink-600 hover:bg-stone-200/70 dark:bg-white/10 dark:text-stone-300 dark:hover:bg-white/15'
	]}
>
	{@render children()}
</button>

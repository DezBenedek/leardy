<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		ariaLabel: string;
		size?: number;
		href?: string;
		disabled?: boolean;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	}

	let { ariaLabel, size = 52, href, disabled = false, onclick, children }: Props = $props();

	let cls = [
		'grid shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-600 transition',
		'hover:bg-stone-50 active:scale-95 dark:border-white/10 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-white/10',
		'disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100'
	].join(' ');
</script>

{#if href}
	<a {href} class={cls} style="width:{size}px;height:{size}px" aria-label={ariaLabel} {onclick}>
		{@render children()}
	</a>
{:else}
	<button type="button" class={cls} style="width:{size}px;height:{size}px" aria-label={ariaLabel} {disabled} {onclick}>
		{@render children()}
	</button>
{/if}

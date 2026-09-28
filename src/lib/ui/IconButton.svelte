<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		ariaLabel: string;
		size?: number;
		href?: string;
		disabled?: boolean;
		tone?: 'default' | 'danger';
		title?: string;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	}

	let { ariaLabel, size = 52, href, disabled = false, tone = 'default', title, onclick, children }: Props = $props();

	let cls = $derived(
		[
			'grid shrink-0 place-items-center rounded-full border transition',
			'active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100',
			'disabled:pointer-events-none disabled:opacity-50',
			tone === 'danger'
				? 'border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-500/10'
				: 'border-stone-200 bg-white text-ink-600 hover:bg-stone-50 dark:border-white/10 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-white/10'
		].join(' ')
	);
</script>

{#if href}
	<a {href} class={cls} style="width:{size}px;height:{size}px" aria-label={ariaLabel} title={title ?? ariaLabel} {onclick}>
		{@render children()}
	</a>
{:else}
	<button type="button" class={cls} style="width:{size}px;height:{size}px" aria-label={ariaLabel} title={title ?? ariaLabel} {disabled} {onclick}>
		{@render children()}
	</button>
{/if}

<script lang="ts">
	import type { Snippet } from 'svelte';

	type Tone = 'plain' | 'tint' | 'brand';
	type Pad = 'none' | 'md' | 'lg';

	interface Props {
		href?: string;
		tone?: Tone;
		pad?: Pad;
		onclick?: (e: MouseEvent) => void;
		ariaLabel?: string;
		children: Snippet;
	}

	let { href, tone = 'plain', pad = 'md', onclick, ariaLabel, children }: Props = $props();

	const tones: Record<Tone, string> = {
		plain: 'border-stone-200 bg-white dark:border-white/10 dark:bg-stone-900',
		tint: 'border-stone-200 bg-stone-100 dark:border-white/10 dark:bg-white/5',
		brand: 'border-transparent bg-brand-600 text-white shadow-lg shadow-brand-600/25 dark:bg-brand-500'
	};

	const pads: Record<Pad, string> = { none: 'p-0', md: 'p-4', lg: 'p-6' };
	let interactive = $derived(Boolean(href ?? onclick));

	let cls = $derived(
		[
			'block rounded-(--radius-card) border transition motion-reduce:transition-none',
			tones[tone],
			pads[pad],
			interactive ? 'hover:bg-stone-50 active:scale-[0.995] dark:hover:bg-white/5 cursor-pointer' : ''
		].join(' ')
	);
</script>

{#if href}
	<a {href} class={cls} aria-label={ariaLabel} {onclick}>{@render children()}</a>
{:else if onclick}
	<button type="button" class={[cls, 'w-full text-left']} aria-label={ariaLabel} {onclick}>
		{@render children()}
	</button>
{:else}
	<div class={cls}>{@render children()}</div>
{/if}

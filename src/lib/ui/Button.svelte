<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'dark' | 'tint' | 'outline' | 'ghost' | 'danger';
	type Size = 'sm' | 'md' | 'lg';

	interface Props {
		variant?: Variant;
		size?: Size;
		href?: string;
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		busy?: boolean;
		block?: boolean;
		ariaLabel?: string;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		href,
		type = 'button',
		disabled = false,
		busy = false,
		block = false,
		ariaLabel,
		onclick,
		children
	}: Props = $props();

	const variants: Record<Variant, string> = {
		primary:
			'bg-brand-500 text-white shadow-lg shadow-brand-500/20 hover:bg-brand-600 dark:shadow-black/30',
		dark: 'bg-ink-900 text-white hover:opacity-90 dark:bg-white dark:text-ink-900',
		tint: 'bg-stone-100 text-ink-900 hover:bg-stone-200/70 dark:bg-white/10 dark:text-white dark:hover:bg-white/15',
		outline:
			'border border-stone-300 text-ink-600 hover:bg-stone-50 dark:border-white/15 dark:text-stone-200 dark:hover:bg-white/10',
		ghost: 'text-ink-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-white/10',
		danger: 'bg-red-600 text-white hover:bg-red-700'
	};

	const sizes: Record<Size, string> = {
		sm: 'px-3.5 py-2 text-sm',
		md: 'px-4 py-2.5 text-sm',
		lg: 'px-5 py-3 text-[15px]'
	};

	let cls = $derived(
		[
			'inline-flex items-center justify-center gap-1.5 rounded-full font-bold transition',
			'active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100',
			'disabled:pointer-events-none disabled:opacity-60',
			variants[variant],
			sizes[size],
			block ? 'w-full' : ''
		].join(' ')
	);

	let isDisabled = $derived(disabled || busy);
</script>

{#if href}
	<a {href} class={cls} aria-label={ariaLabel} aria-disabled={isDisabled} aria-busy={busy} {onclick}>
		{@render children()}
	</a>
{:else}
	<button {type} class={cls} disabled={isDisabled} aria-label={ariaLabel} aria-busy={busy} {onclick}>
		{@render children()}
	</button>
{/if}

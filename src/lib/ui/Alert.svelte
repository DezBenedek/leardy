<script lang="ts">
	import type { Snippet } from 'svelte';

	type Tone = 'danger' | 'success' | 'info' | 'warning';

	interface Props {
		tone?: Tone;
		title?: string;
		children: Snippet;
	}

	let { tone = 'info', title, children }: Props = $props();

	const tones: Record<Tone, string> = {
		danger: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
		success: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300',
		info: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-white',
		warning: 'bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300'
	};
</script>

<div role={tone === 'danger' ? 'alert' : 'status'} class={['rounded-2xl px-4 py-3 text-sm font-medium', tones[tone]]}>
	{#if title}<p class="font-bold">{title}</p>{/if}
	{@render children()}
</div>

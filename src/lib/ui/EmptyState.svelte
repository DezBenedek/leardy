<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		children?: Snippet;
	}

	let { title, description, children }: Props = $props();
</script>

<div class="rounded-(--radius-card) border border-dashed border-stone-300 p-6 text-center dark:border-white/15">
	<p class="text-[15px] font-bold text-ink-900 dark:text-white">{title}</p>
	{#if description}
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">{description}</p>
	{/if}
	{#if children}
		<div class="mt-4">{@render children()}</div>
	{/if}
</div>

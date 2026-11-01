<script lang="ts">
	import IconButton from '$lib/ui/IconButton.svelte';
	import { ArrowLeft } from '@lucide/svelte';
	import type { LiveStatus } from './live-types';

	interface Props {
		title: string;
		status: LiveStatus;
		onBack: () => void;
	}

	let { title, status, onBack }: Props = $props();
</script>

<div class="flex items-center gap-2 px-1">
	<IconButton ariaLabel="Vissza" size={44} onclick={onBack}>
		<ArrowLeft size={21} />
	</IconButton>
	<div class="min-w-0 flex-1">
		<h1 class="font-display truncate text-[26px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
			{title}
		</h1>
	</div>
	{#if status === 'live'}
		<span class="flex shrink-0 items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1.5 text-[12px] font-extrabold text-red-600 dark:text-red-300">
			<span class="size-2 animate-pulse rounded-full bg-red-500" aria-hidden="true"></span> Élő
		</span>
	{:else if status === 'lobby'}
		<span class="shrink-0 rounded-full bg-stone-100 px-3 py-1.5 text-[12px] font-extrabold text-stone-500 dark:bg-white/10 dark:text-stone-300">
			Váró
		</span>
	{:else}
		<span class="shrink-0 rounded-full bg-stone-100 px-3 py-1.5 text-[12px] font-extrabold text-stone-500 dark:bg-white/10 dark:text-stone-300">
			Vége
		</span>
	{/if}
</div>

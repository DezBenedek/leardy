<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toasts } from './toast.svelte.js';
</script>

<div aria-live="polite" class="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-4">
	{#if toasts.current}
		<div
			transition:fly={{ y: -16, duration: 320, easing: cubicOut }}
			class="text-background mt-[calc(env(safe-area-inset-top)+10px)] max-w-md rounded-full px-4 py-2.5 text-center text-sm font-semibold shadow-md"
			style="background: var(--foreground); color: var(--background);"
		>
			{toasts.current.message}
		</div>
	{/if}
</div>

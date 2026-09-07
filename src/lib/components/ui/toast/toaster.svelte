<script lang="ts">
	import { fly } from 'svelte/transition';
	import { CheckCircle2 } from 'lucide-svelte';
	import { toasts } from './toast.svelte.js';
</script>

<div
	aria-live="polite"
	class="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-8"
>
	{#each toasts.items as toast (toast.id)}
		<div
			transition:fly={{ y: 12, duration: 200 }}
			class="bg-foreground text-background pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 shadow-lg"
		>
			<CheckCircle2 class="text-primary size-5 shrink-0" />
			<div class="min-w-0">
				<p class="text-sm font-semibold">{toast.title}</p>
				{#if toast.desc}
					<p class="text-xs opacity-80">{toast.desc}</p>
				{/if}
			</div>
		</div>
	{/each}
</div>

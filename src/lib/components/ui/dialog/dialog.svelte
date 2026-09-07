<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { X } from 'lucide-svelte';
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		children?: Snippet;
		footer?: Snippet;
		class?: string;
	}

	let { open = $bindable(false), title, description, children, footer, class: className }: Props =
		$props();

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div class="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
		<button
			type="button"
			aria-label="Bezárás"
			transition:fade={{ duration: 150 }}
			class="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
			onclick={() => (open = false)}
		></button>
		<div
			transition:scale={{ duration: 180, start: 0.96 }}
			role="dialog"
			aria-modal="true"
			aria-label={title}
			class={cn(
				'bg-card relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border shadow-xl sm:max-w-md sm:rounded-3xl',
				className
			)}
		>
			<div class="flex items-start justify-between gap-3 px-5 pt-5">
				<div>
					<h2 class="text-lg font-bold tracking-tight">{title}</h2>
					{#if description}
						<p class="text-muted-foreground mt-0.5 text-sm">{description}</p>
					{/if}
				</div>
				<button
					type="button"
					aria-label="Bezárás"
					onclick={() => (open = false)}
					class="hover:bg-accent -mr-1 grid size-9 shrink-0 place-items-center rounded-lg transition-colors"
				>
					<X class="size-5" />
				</button>
			</div>
			<div class="overflow-y-auto px-5 py-4">
				{@render children?.()}
			</div>
			{#if footer}
				<div class="flex gap-2 border-t px-5 py-4">
					{@render footer?.()}
				</div>
			{/if}
		</div>
	</div>
{/if}

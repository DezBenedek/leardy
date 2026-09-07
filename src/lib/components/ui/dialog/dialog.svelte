<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { X } from 'lucide-svelte';
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	interface Props {
		open?: boolean;
		title: string;
		description?: string;
		children?: Snippet;
		footer?: Snippet;
		class?: string;
	}

	let { open = $bindable(false), title, description, children, footer, class: className }: Props =
		$props();
</script>

<DialogPrimitive.Root bind:open>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay
			class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[90] bg-black/50 backdrop-blur-[2px]"
		/>
		<DialogPrimitive.Content
			aria-label={title}
			class={cn(
				'bg-card data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4 fixed inset-x-0 bottom-0 z-[91] flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[20px] border shadow-xl duration-300 outline-none sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0',
				className
			)}
		>
			<div class="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden="true"></div>
			<div class="flex items-start justify-between gap-3 px-5 pt-3 sm:pt-5">
				<div class="min-w-0">
					<DialogPrimitive.Title class="text-lg font-bold tracking-tight">
						{title}
					</DialogPrimitive.Title>
					{#if description}
						<DialogPrimitive.Description class="text-muted-foreground mt-0.5 text-sm">
							{description}
						</DialogPrimitive.Description>
					{/if}
				</div>
				<DialogPrimitive.Close
					aria-label="Bezárás"
					class="hover:bg-accent -mr-1 grid size-9 shrink-0 place-items-center rounded-lg transition-colors"
				>
					<X class="size-5" />
				</DialogPrimitive.Close>
			</div>
			<div class="overflow-y-auto px-5 py-4">
				{@render children?.()}
			</div>
			{#if footer}
				<div class="flex gap-2 border-t px-5 py-4">
					{@render footer?.()}
				</div>
			{/if}
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>

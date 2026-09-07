<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	export const selectTriggerStyle =
		'border-input bg-secondary/70 text-foreground focus-visible:ring-ring/40 flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-transparent px-4 text-[15px] font-medium whitespace-nowrap transition outline-none focus-visible:border-transparent focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:opacity-60';

	export const selectContentStyle =
		'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 relative z-[95] max-h-72 min-w-[8rem] overflow-hidden rounded-xl border shadow-lg duration-200';

	export const selectItemStyle =
		'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';
</script>

<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { Check, ChevronDown } from 'lucide-svelte';
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	interface Option {
		value: string;
		label: string;
	}

	interface Props {
		value?: string;
		options: Option[];
		placeholder?: string;
		disabled?: boolean;
		class?: string;
		children?: Snippet;
	}

	let {
		value = $bindable(''),
		options,
		placeholder = 'Válassz…',
		disabled = false,
		class: className,
		children
	}: Props = $props();
</script>

<SelectPrimitive.Root bind:value type="single" {disabled}>
	<SelectPrimitive.Trigger class={cn(selectTriggerStyle, className)}>
		{#if children}
			{@render children()}
		{:else}
			<SelectPrimitive.Value {placeholder} class="truncate" />
		{/if}
		<ChevronDown class="opacity-60" />
	</SelectPrimitive.Trigger>
	<SelectPrimitive.Portal>
		<SelectPrimitive.Content class={selectContentStyle} sideOffset={6}>
			<SelectPrimitive.Viewport class="p-1.5">
				{#each options as opt (opt.value)}
					<SelectPrimitive.Item value={opt.value} label={opt.label} class={selectItemStyle}>
						{#snippet children({ selected }: { selected: boolean })}
							<span class="w-4 shrink-0">
								{#if selected}
									<Check class="size-4" />
								{/if}
							</span>
							{opt.label}
						{/snippet}
					</SelectPrimitive.Item>
				{/each}
			</SelectPrimitive.Viewport>
		</SelectPrimitive.Content>
	</SelectPrimitive.Portal>
</SelectPrimitive.Root>

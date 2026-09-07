<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';
	import { ChevronRight } from 'lucide-svelte';
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	interface Props {
		value: string;
		title: string;
		icon?: Snippet;
		children?: Snippet;
		class?: string;
	}

	let { value, title, icon, children, class: className }: Props = $props();
</script>

<AccordionPrimitive.Root type="single" class={cn('w-full', className)}>
	<AccordionPrimitive.Item {value}>
		<AccordionPrimitive.Header>
			<AccordionPrimitive.Trigger
				class="hover:bg-accent/50 flex w-full cursor-pointer items-center gap-3 rounded-[18px] px-4 py-3.5 text-left text-[15px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&[data-state=open]>svg.chevron]:rotate-90"
			>
				{#if icon}
					{@render icon()}
				{/if}
				<span class="flex-1">{title}</span>
				<ChevronRight class="chevron text-muted-foreground size-5 shrink-0 transition-transform duration-300" />
			</AccordionPrimitive.Trigger>
		</AccordionPrimitive.Header>
		<AccordionPrimitive.Content
			class="data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up overflow-hidden px-4"
		>
			<div class="pt-1 pb-3.5">
				{@render children?.()}
			</div>
		</AccordionPrimitive.Content>
	</AccordionPrimitive.Item>
</AccordionPrimitive.Root>

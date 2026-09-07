<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	interface Tab {
		value: string;
		label: string;
	}

	interface Props {
		value?: string;
		tabs: Tab[];
		class?: string;
		listClass?: string;
		extra?: Snippet;
	}

	let { value = $bindable(''), tabs, class: className, listClass, extra }: Props = $props();
</script>

<TabsPrimitive.Root bind:value class={cn('w-full', className)}>
	<TabsPrimitive.List
		class={cn(
			'bg-secondary/70 flex w-full items-center gap-1 overflow-x-auto rounded-xl p-1',
			listClass
		)}
	>
		{#each tabs as tab (tab.value)}
			<TabsPrimitive.Trigger
				value={tab.value}
				class="text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground hover:text-foreground flex-1 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-all outline-none data-[state=active]:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50"
			>
				{tab.label}
			</TabsPrimitive.Trigger>
		{/each}
		{#if extra}
			{@render extra()}
		{/if}
	</TabsPrimitive.List>
</TabsPrimitive.Root>

<script lang="ts">
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Layers } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		icon: typeof Layers;
		title: string;
		desc: string;
		children?: Snippet;
	}

	let { icon: Icon, title, desc, children }: Props = $props();
</script>

<Card>
	<CardContent class="flex flex-col items-center gap-2 py-10 text-center">
		<span class="bg-primary/10 grid size-12 place-items-center rounded-2xl">
			<Icon class="text-primary size-6" />
		</span>
		<p class="font-semibold">{title}</p>
		<p class="text-muted-foreground max-w-xs text-sm">{desc}</p>
		{#if children}
			<div class="mt-2 flex flex-wrap justify-center gap-2">
				{@render children?.()}
			</div>
		{/if}
	</CardContent>
</Card>

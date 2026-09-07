<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div data-slot="card-title" class={cn('text-base leading-none font-semibold', className)} {...restProps}>
	{@render children?.()}
</div>

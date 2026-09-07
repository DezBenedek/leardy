<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div data-slot="alert-description" class={cn('text-muted-foreground col-start-2 text-sm', className)} {...restProps}>
	{@render children?.()}
</div>

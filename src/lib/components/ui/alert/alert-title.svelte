<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div data-slot="alert-title" class={cn('col-start-2 font-semibold', className)} {...restProps}>
	{@render children?.()}
</div>

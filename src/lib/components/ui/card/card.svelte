<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	data-slot="card"
	class={cn('bg-card text-card-foreground flex flex-col gap-4 rounded-2xl border py-5 shadow-sm', className)}
	{...restProps}
>
	{@render children?.()}
</div>

<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	data-slot="card"
	class={cn('bg-card text-card-foreground flex flex-col gap-4 rounded-[18px] border py-5 shadow-[0_1px_2px_rgb(28_25_23/0.05),0_12px_32px_-20px_rgb(28_25_23/0.25)]', className)}
	{...restProps}
>
	{@render children?.()}
</div>

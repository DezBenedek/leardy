<script lang="ts">
	import { Progress as ProgressPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		class: className,
		value = 0,
		max = 100,
		...restProps
	}: ProgressPrimitive.RootProps & { value?: number; max?: number } = $props();
</script>

<ProgressPrimitive.Root
	data-slot="progress"
	{value}
	{max}
	class={cn('bg-secondary relative h-2 w-full overflow-hidden rounded-full', className)}
	{...restProps}
>
	<div
		data-slot="progress-indicator"
		class="bg-primary h-full flex-1 rounded-full transition-transform duration-500 ease-out"
		style="transform: translateX(-{100 - (max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0)}%)"
	></div>
</ProgressPrimitive.Root>

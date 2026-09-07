<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		class: className,
		value = 0,
		max = 100,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & { value?: number; max?: number } = $props();

	const pct = $derived(Math.min(100, Math.max(0, (value / max) * 100)));
</script>

<div
	data-slot="progress"
	role="progressbar"
	aria-valuemin={0}
	aria-valuemax={max}
	aria-valuenow={Math.round(value)}
	class={cn('bg-secondary h-2 w-full overflow-hidden rounded-full', className)}
	{...restProps}
>
	<div class="bg-primary h-full rounded-full transition-all" style="width: {pct}%"></div>
</div>

<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let { class: className, value = $bindable(), ...restProps }: HTMLTextareaAttributes = $props();
</script>

<textarea
	data-slot="textarea"
	bind:value
	class={cn(
		'border-input bg-secondary/70 text-foreground placeholder:text-muted-foreground focus-visible:ring-ring/40 field-sizing-content flex min-h-22 w-full min-w-0 rounded-xl border border-transparent px-4 py-3 text-[15px] font-medium transition outline-none focus-visible:border-transparent focus-visible:ring-4 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:pointer-events-none disabled:opacity-50',
		className
	)}
	{...restProps}
></textarea>

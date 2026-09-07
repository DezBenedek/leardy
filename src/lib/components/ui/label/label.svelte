<script lang="ts">
	import { Label as LabelPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let { class: className, ...restProps }: LabelPrimitive.RootProps = $props();
</script>

<LabelPrimitive.Root
	data-slot="label"
	class={cn(
		'text-muted-foreground mb-1.5 block text-[13px] font-semibold select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
		className
	)}
	{...restProps}
/>

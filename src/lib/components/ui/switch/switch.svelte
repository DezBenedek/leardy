<script lang="ts">
	import { Switch as SwitchPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let { class: className, checked = $bindable(false), ...restProps }: SwitchPrimitive.RootProps =
		$props();
</script>

<SwitchPrimitive.Root
	data-slot="switch"
	bind:checked
	class={cn(
		'data-[state=checked]:bg-primary data-[state=unchecked]:bg-secondary focus-visible:ring-ring/40 inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-transparent px-0.5 transition-colors outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class="bg-primary-foreground data-[state=unchecked]:bg-foreground/60 block size-6 rounded-full shadow-sm transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
	/>
</SwitchPrimitive.Root>

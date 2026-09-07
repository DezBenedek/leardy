<script lang="ts">
	import { Avatar as AvatarPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	interface Props extends AvatarPrimitive.RootProps {
		initials?: string;
		children?: Snippet;
	}

	let { class: className, initials = '?', children, ...restProps }: Props = $props();
</script>

<AvatarPrimitive.Root
	data-slot="avatar"
	class={cn('bg-secondary text-secondary-foreground relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold', className)}
	{...restProps}
>
	<AvatarPrimitive.Fallback class="grid size-full place-items-center">
		{#if children}
			{@render children()}
		{:else}
			{initials}
		{/if}
	</AvatarPrimitive.Fallback>
</AvatarPrimitive.Root>

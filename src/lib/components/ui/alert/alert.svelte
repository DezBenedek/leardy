<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	export const alertVariants = tv({
		base: 'relative grid w-full items-start gap-x-3 gap-y-0.5 rounded-[18px] border px-4 py-3.5 text-sm [&>svg]:size-5 [&>svg]:translate-y-0.5 [&>svg]:text-current grid-cols-[auto_1fr]',
		variants: {
			variant: {
				default: 'bg-card text-card-foreground',
				info: 'bg-xp/10 text-foreground border-xp/25 [&>svg]:text-xp',
				success: 'bg-forest/10 text-foreground border-forest/25 [&>svg]:text-forest',
				warning: 'bg-streak/10 text-foreground border-streak/25 [&>svg]:text-streak',
				destructive: 'bg-wine/10 text-foreground border-wine/25 [&>svg]:text-wine'
			}
		},
		defaultVariants: { variant: 'default' }
	});

	export type AlertVariant = VariantProps<typeof alertVariants>['variant'];
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		class: className,
		variant = 'default',
		children,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant } = $props();
</script>

<div data-slot="alert" role="alert" class={cn(alertVariants({ variant }), className)} {...restProps}>
	{@render children?.()}
</div>

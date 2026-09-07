<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex shrink-0 items-center justify-center gap-2 rounded-[14px] text-sm font-semibold whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-primary/90',
				secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
				outline: 'bg-card text-foreground border hover:bg-accent hover:text-accent-foreground',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
				// StampButton (régi): körvonalas, nagybetűs, ritkított felirat
				stamp: 'border-[1.5px] border-current bg-transparent min-h-12 min-w-12 px-3.5 py-2.5 text-[12px] font-semibold tracking-[0.12em] uppercase'
			},
			size: {
				default: 'h-10 px-4 py-2',
				sm: 'h-8 rounded-[10px] px-3 text-xs',
				lg: 'h-12 rounded-[14px] px-6 text-base',
				xl: 'min-h-[52px] rounded-[14px] px-6 text-base',
				icon: 'size-10'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Props =
		| ({
				variant?: ButtonVariant;
				size?: ButtonSize;
		  } & HTMLAnchorAttributes & { href: string })
		| ({
				variant?: ButtonVariant;
				size?: ButtonSize;
		  } & HTMLButtonAttributes & { href?: undefined });

	let { class: className, variant = 'default', size = 'default', children, ...rest }: Props =
		$props();

	const isLink = $derived('href' in rest && rest.href !== undefined);
</script>

{#if isLink}
	<a
		class={cn(buttonVariants({ variant, size }), className)}
		{...rest as HTMLAnchorAttributes}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		type="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{...rest as HTMLButtonAttributes}
	>
		{@render children?.()}
	</button>
{/if}

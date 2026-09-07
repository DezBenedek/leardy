<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08),0_8px_16px_-8px_var(--primary)] hover:brightness-[1.06]',
				secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
				outline: 'bg-card text-foreground border hover:bg-accent hover:text-accent-foreground',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
			},
			size: {
				default: 'h-11 px-4 py-2',
				sm: 'h-9 rounded-[10px] px-3 text-[13px]',
				lg: 'h-12 rounded-xl px-6 text-[15px]',
				xl: 'min-h-[52px] rounded-xl px-6 text-base',
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
	const linkDisabled = $derived(isLink && (rest as { disabled?: unknown }).disabled === true);
	const linkRest = $derived.by(() => {
		const { disabled: _dropped, ...r } = rest as Record<string, unknown>;
		return r;
	});
</script>

{#if isLink}
	<a
		class={cn(buttonVariants({ variant, size }), linkDisabled && 'pointer-events-none opacity-50', className)}
		aria-disabled={linkDisabled || undefined}
		{...linkRest as HTMLAnchorAttributes}
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

<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		icon: any;
		title: string;
		description?: string;
		actionLabel?: string;
		actionHref?: string;
	}

	let { class: className, icon: Icon, title, description, actionLabel, actionHref }: Props = $props();
</script>

<div
	data-slot="empty"
	class={cn(
		'bg-card text-card-foreground flex flex-col items-center gap-2 rounded-[18px] border px-6 py-10 text-center shadow-[0_1px_2px_rgb(28_25_23/0.05),0_12px_32px_-20px_rgb(28_25_23/0.25)]',
		className
	)}
>
	<span class="bg-secondary text-muted-foreground grid size-12 place-items-center rounded-2xl">
		<Icon class="size-6" />
	</span>
	<p class="mt-2 text-[15px] font-semibold">{title}</p>
	{#if description}
		<p class="text-muted-foreground max-w-xs text-sm">{description}</p>
	{/if}
	{#if actionLabel && actionHref}
		<a
			href={actionHref}
			class="bg-primary text-primary-foreground press mt-3 inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
		>
			{actionLabel}
		</a>
	{/if}
</div>

<script lang="ts">
	import { Check } from '@lucide/svelte';

	interface Props {
		checked?: boolean;
		label: string;
	}

	let { checked = $bindable(false), label }: Props = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	onclick={() => (checked = !checked)}
	class={[
		'relative h-8 w-[52px] shrink-0 rounded-full border-2 transition-colors duration-200',
		checked
			? 'border-brand-500 bg-brand-500'
			: 'border-stone-400/70 bg-stone-200 dark:border-white/25 dark:bg-white/10'
	]}
>
	<span
		class={[
			'absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full transition-all duration-200',
			checked
				? 'left-[22px] size-6 bg-white text-brand-600 shadow'
				: 'left-1.5 size-4 bg-stone-500 dark:bg-stone-400'
		]}
	>
		{#if checked}
			<Check size={15} strokeWidth={3.2} />
		{/if}
	</span>
</button>

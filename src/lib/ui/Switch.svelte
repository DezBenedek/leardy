<script lang="ts">
	interface Props {
		checked?: boolean;
		label: string;
		disabled?: boolean;
		id?: string;
	}

	let {
		checked = $bindable(false),
		label,
		disabled = false,
		id = `sw-${Math.random().toString(36).slice(2, 8)}`
	}: Props = $props();
</script>

<button
	type="button"
	{id}
	role="switch"
	aria-checked={checked}
	aria-label={label}
	title={label}
	{disabled}
	onclick={() => {
		if (!disabled) checked = !checked;
	}}
	class={[
		'relative h-8 w-[52px] shrink-0 rounded-full border-2 transition-colors duration-200',
		'motion-reduce:transition-none',
		'disabled:cursor-not-allowed disabled:opacity-50',
		checked
			? 'border-brand-500 bg-brand-500'
			: 'border-stone-400/70 bg-stone-200 dark:border-white/25 dark:bg-white/10'
	]}
>
	<span
		aria-hidden="true"
		class={[
			'absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full transition-all duration-200 motion-reduce:transition-none',
			checked
				? 'left-[22px] size-6 bg-white text-brand-600 shadow'
				: 'left-1.5 size-4 bg-stone-500 dark:bg-stone-400'
		]}
	>
		{#if checked}
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M20 6 9 17l-5-5" />
			</svg>
		{/if}
	</span>
</button>

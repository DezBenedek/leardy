<script lang="ts">
	interface Option {
		value: string;
		label: string;
	}

	interface Props {
		options: Option[];
		value?: string;
		ariaLabel: string;
	}

	let { options, value = $bindable(options[0]?.value ?? ''), ariaLabel }: Props = $props();
</script>

<div role="radiogroup" aria-label={ariaLabel} class="flex gap-2">
	{#each options as opt (opt.value)}
		{@const active = value === opt.value}
		<button
			type="button"
			role="radio"
			aria-checked={active}
			onclick={() => (value = opt.value)}
			class={[
				'flex-1 rounded-full px-4 py-2.5 text-sm transition active:scale-[0.99]',
				'motion-reduce:transition-none motion-reduce:active:scale-100',
				active
					? 'bg-ink-900 font-bold text-white dark:bg-white dark:text-ink-900'
					: 'bg-stone-100 font-semibold text-ink-600 hover:bg-stone-200/70 dark:bg-white/10 dark:text-stone-300 dark:hover:bg-white/15'
			]}
		>
			{opt.label}
		</button>
	{/each}
</div>

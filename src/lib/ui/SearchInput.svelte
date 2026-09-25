<script lang="ts">
	interface Props {
		value?: string;
		placeholder?: string;
		ariaLabel?: string;
		disabled?: boolean;
	}

	let {
		value = $bindable(''),
		placeholder = 'Keresés…',
		ariaLabel = 'Keresés',
		disabled = false
	}: Props = $props();
</script>

<div class="relative min-w-0 flex-1">
	<svg
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-stone-400"
	>
		<circle cx="11" cy="11" r="8" />
		<path d="m21 21-4.3-4.3" />
	</svg>
	<input
		bind:value
		type="search"
		{placeholder}
		aria-label={ariaLabel}
		autocomplete="off"
		{disabled}
		class={[
			'w-full rounded-full border border-stone-200 bg-white py-3 pr-4 pl-11 text-[15px] text-ink-900 outline-none transition',
			'placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
			'dark:border-white/10 dark:bg-stone-900 dark:text-white dark:focus:ring-brand-500/20',
			'disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none'
		]}
	/>
</div>

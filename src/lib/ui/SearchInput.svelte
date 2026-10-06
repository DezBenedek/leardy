<script lang="ts">
	import { X } from '@lucide/svelte';

	interface Props {
		value?: string;
		placeholder?: string;
		ariaLabel?: string;
		disabled?: boolean;
		onfocus?: () => void;
		onblur?: () => void;
	}

	let {
		value = $bindable(''),
		placeholder = 'Keresés…',
		ariaLabel = 'Keresés',
		disabled = false,
		onfocus,
		onblur
	}: Props = $props();

	let inputEl: HTMLInputElement | null = $state(null);
	let focused = $state(false);

	function clear() {
		value = '';
		inputEl?.focus();
	}
</script>

<style>
	input[type='search']::-webkit-search-cancel-button {
		display: none;
	}
</style>

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
		bind:this={inputEl}
		bind:value
		type="search"
		{placeholder}
		aria-label={ariaLabel}
		autocomplete="off"
		{disabled}
		onfocus={() => {
			focused = true;
			onfocus?.();
		}}
		onblur={() => {
			focused = false;
			onblur?.();
		}}
		onkeydown={(e) => {
			if (e.key === 'Enter') e.currentTarget.blur();
		}}
		class={[
			'w-full rounded-full border border-stone-200 bg-white py-3 pr-4 pl-11 text-[15px] text-ink-900 outline-none transition',
			'placeholder:text-stone-400 focus:border-stone-300',
			'dark:border-white/10 dark:bg-stone-900 dark:text-white dark:focus:border-white/25',
			value && focused ? 'pr-10' : 'pr-4',
			'disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none'
		]}
	/>
	{#if value && focused && !disabled}
		<button
			type="button"
			onclick={clear}
			aria-label="Keresés törlése"
			class="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-ink-900 active:scale-95 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-white"
		>
			<X size={16} aria-hidden="true" />
		</button>
	{/if}
</div>

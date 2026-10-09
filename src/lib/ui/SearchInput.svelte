<script lang="ts">
	import { X } from '@lucide/svelte';

	interface Props {
		value?: string;
		placeholder?: string;
		ariaLabel?: string;
		disabled?: boolean;
		/** Kitölti a szabad helyet, szűk helyen kör alakú keresőikonként jelenik meg. */
		expandable?: boolean;
		onfocus?: () => void;
		onblur?: () => void;
	}

	let {
		value = $bindable(''),
		placeholder = 'Keresés…',
		ariaLabel = 'Keresés',
		disabled = false,
		expandable = false,
		onfocus,
		onblur
	}: Props = $props();

	let inputEl: HTMLInputElement | null = $state(null);
	let focused = $state(false);
	let expanded = $derived(!expandable || focused || value !== '');

	function clear() {
		value = '';
		inputEl?.focus();
	}
</script>

<style>
	input[type='search']::-webkit-search-cancel-button {
		display: none;
	}
	.expandable { flex: 1 0 46px; container-type: inline-size; }
	.expandable input { height: 46px; padding-block: 0; }
	@container (max-width: 95px) {
		.expandable input:not(:focus) { padding-inline: 0; color: transparent; cursor: pointer; }
		.expandable input:not(:focus)::placeholder { color: transparent; }
		.expandable:not(:focus-within) svg { left: 50%; translate: -50% -50%; }
	}
	@container (min-width: 96px) {
		.expandable input { padding-left: 44px; padding-right: 40px; color: var(--color-ink-900); cursor: text; }
		.expandable input::placeholder { color: var(--color-stone-400); }
		.expandable svg { left: 16px; translate: 0 -50%; }
		:global(.dark) .expandable input { color: white; }
		.expandable:focus-within input { padding-right: 40px; }
	}
</style>

<div class={['relative min-w-0', expandable ? 'expandable' : 'flex-1']} data-expanded={expanded}>
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
		class={['pointer-events-none absolute top-1/2 -translate-y-1/2 text-stone-400', expanded ? 'left-4' : 'left-1/2 -translate-x-1/2']}
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
			'w-full min-w-0 rounded-full border border-stone-200 bg-white py-3 text-[15px] text-ink-900 outline-none transition',
			'placeholder:text-stone-400 focus:border-stone-300',
			'dark:border-white/10 dark:bg-stone-900 dark:text-white dark:focus:border-white/25',
			expanded ? ['pl-11', value ? 'pr-10' : 'pr-4'] : 'px-0',
			'disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none',
			!expanded && 'cursor-pointer text-transparent placeholder:text-transparent'
		]}
	/>
	{#if value && !disabled}
		<button
			type="button"
			onpointerdown={(event) => event.preventDefault()}
			onclick={clear}
			aria-label="Keresés törlése"
			class="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-ink-900 active:scale-95 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-white"
		>
			<X size={16} aria-hidden="true" />
		</button>
	{/if}
</div>

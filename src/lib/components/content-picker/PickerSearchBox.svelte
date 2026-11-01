<script lang="ts">
	import { Search, X } from '@lucide/svelte';

	let { query = $bindable('') }: { query: string } = $props();
</script>

<div class="relative mt-2">
	<Search
		size={16}
		class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-400 dark:text-stone-500"
		aria-hidden="true"
	/>
	<input
		type="text"
		bind:value={query}
		placeholder="Keresés…"
		aria-label="Keresés"
		autocomplete="off"
		class="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pr-10 pl-10 text-[14px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 motion-reduce:transition-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:bg-white/5 dark:focus:ring-brand-500/20"
	/>
	{#if query}
		<button
			type="button"
			onpointerdown={(event) => event.preventDefault()}
			onclick={() => (query = '')}
			aria-label="Keresés törlése"
			class="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-stone-400 transition hover:bg-black/5 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
		>
			<X size={15} />
		</button>
	{/if}
</div>

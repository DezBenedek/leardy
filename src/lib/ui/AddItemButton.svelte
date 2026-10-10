<script lang="ts">
	import { Plus } from '@lucide/svelte';
	let { label, onclick, disabled = false, id }: { label: string; onclick: () => void; disabled?: boolean; id?: string } = $props();
</script>

<button
	{id}
	type="button"
	{disabled}
	{onclick}
	class="add-item flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-200 py-4 text-sm font-extrabold text-stone-400 transition hover:border-brand-300 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand-500 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 dark:border-white/10 dark:text-stone-500 dark:hover:border-brand-500/50 dark:hover:text-white"
>
	<Plus size={18} strokeWidth={2.75} aria-hidden="true" />
	{label}
</button>

<style>
	:global(.reduce-motion) .add-item { transition: none; transform: none; }
</style>

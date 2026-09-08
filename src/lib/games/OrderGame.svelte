<script lang="ts">
	import { ArrowDown, RotateCcw } from '@lucide/svelte';
	import type { GameProps } from './types';

	let { q, onAnswer }: GameProps = $props();
	let picked = $state<string[]>([]);

	let remaining = $derived(q.options.filter((o) => !picked.includes(o)));
</script>

<!-- Sorrendbe rakós: bökd sorrendben a helyes sorrendre. -->
{#if picked.length > 0}
	<ol class="mb-2 space-y-1.5">
		{#each picked as p, i (p + i)}
			<li class="flex items-center gap-2.5 rounded-xl bg-brand-500 px-3.5 py-2.5 text-[15px] font-semibold text-white">
				<span class="grid size-6 shrink-0 place-items-center rounded-full bg-white/25 text-xs font-extrabold">{i + 1}</span>
				{p}
			</li>
		{/each}
	</ol>
{/if}
<div class="grid gap-2">
	{#each remaining as opt, i (opt)}
		<button
			onclick={() => (picked = [...picked, opt])}
			class="rounded-xl border border-stone-200 bg-white px-4 py-3 text-left text-[15px] font-medium text-ink-900 transition hover:border-brand-500 hover:bg-brand-50 active:scale-[0.99] dark:border-white/10 dark:bg-transparent dark:text-white"
		>
			{opt}
			{#if i < remaining.length - 1}<ArrowDown size={14} class="mt-1 text-stone-300" />{/if}
		</button>
	{:else}
		<p class="text-sm text-stone-500 dark:text-stone-400">Minden elem sorban — küldd be!</p>
	{/each}
</div>
<div class="mt-3 flex gap-2">
	<button
		onclick={() => (picked = [])}
		disabled={picked.length === 0}
		class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-4 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-stone-50 disabled:opacity-50 dark:border-white/10 dark:text-stone-300"
	>
		<RotateCcw size={15} /> Újra
	</button>
	<button
		onclick={() => onAnswer(JSON.stringify(picked))}
		disabled={picked.length !== q.options.length}
		class="flex-1 rounded-full bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
	>
		Kész ({picked.length}/{q.options.length})
	</button>
</div>

<script lang="ts">
	import { ArrowDown, RotateCcw } from '@lucide/svelte';
	import type { GameProps } from './types';

	let { q, onAnswer, picked = null, correct = null }: GameProps = $props();
	let chosen = $state<string[]>([]);

	let submitted = $derived(picked !== null && picked !== undefined);
	let remaining = $derived(q.options.filter((o) => !chosen.includes(o)));
	let corrArr = $derived.by<string[]>(() => {
		if (correct === null || correct === undefined) return [];
		try {
			const p: unknown = JSON.parse(correct);
			return Array.isArray(p) ? p.map(String) : [];
		} catch {
			return [];
		}
	});

	function itemTone(item: string, idx: number): string {
		if (!submitted || corrArr.length === 0) {
			return 'border-stone-200 bg-white text-ink-900 hover:border-brand-500 hover:bg-brand-50 dark:border-white/10 dark:bg-transparent dark:text-white';
		}
		return corrArr[idx] === item
			? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-400/10 dark:text-emerald-200'
			: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-400/10 dark:text-red-200';
	}
</script>

<!-- Sorrendbe rakós: bökd sorrendben a helyes sorrendre. -->
{#if chosen.length > 0}
	<ol class="mb-2 space-y-1.5">
		{#each chosen as p, i (p + i)}
			<li
				class={[
					'flex items-center gap-2.5 rounded-xl border-2 px-3.5 py-2.5 text-[15px] font-semibold',
					itemTone(p, i)
				]}
			>
				<span class="grid size-6 shrink-0 place-items-center rounded-full bg-ink-900/10 text-xs font-extrabold tabular-nums dark:bg-white/15">{i + 1}</span>
				{p}
			</li>
		{/each}
	</ol>
{/if}
{#if !submitted}
	<div class="grid gap-2">
		{#each remaining as opt, i (opt)}
			<button
				onclick={() => (chosen = [...chosen, opt])}
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
			onclick={() => (chosen = [])}
			disabled={chosen.length === 0}
			class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-4 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-stone-50 disabled:opacity-50 dark:border-white/10 dark:text-stone-300"
		>
			<RotateCcw size={15} /> Újra
		</button>
		<button
			onclick={() => onAnswer(JSON.stringify(chosen))}
			disabled={chosen.length !== q.options.length}
			class="flex-1 rounded-full bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-50"
		>
			Kész ({chosen.length}/{q.options.length})
		</button>
	</div>
{/if}

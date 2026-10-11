<script lang="ts">
	import { RotateCcw } from '@lucide/svelte';
	import type { GameProps } from '../../games/types';

	let { q, onAnswer, picked = null, correct = null }: GameProps = $props();
	let chosen = $state<string[]>([]);

	let submitted = $derived(picked !== null && picked !== undefined);
	const values = $derived.by<string[]>(() => {
		if (picked === null || picked === undefined) return chosen;
		try {
			const answer: unknown = JSON.parse(picked);
			return Array.isArray(answer) && answer.every((item) => typeof item === 'string') ? answer : chosen;
		} catch { return chosen; }
	});
	let remaining = $derived(q.options.filter((o) => !values.includes(o)));
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
			return 'border-stone-200 bg-white text-ink-900 hover:border-brand-500 hover:bg-brand-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5';
		}
		return corrArr[idx] === item
			? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-400/10 dark:text-emerald-200'
			: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-400/10 dark:text-red-200';
	}
</script>

{#if values.length > 0}
	<ol aria-label="Összeállított sorrend" class="mb-3 space-y-1.5">
		{#each values as item, index (item)}
			<li>
				<button type="button" disabled={submitted} aria-label={`${index + 1}. ${item}, visszatesz a lehetőségek közé`} onclick={() => (chosen = chosen.filter((_, i) => i !== index))} class={['flex min-h-11 w-full items-center gap-2.5 rounded-xl border-2 px-3.5 py-2.5 text-left text-[15px] font-semibold disabled:opacity-100', itemTone(item, index)]}>
					<span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full bg-ink-900/10 text-xs font-extrabold tabular-nums dark:bg-white/15">{index + 1}</span>
					{item}
				</button>
			</li>
		{/each}
	</ol>
{/if}
{#if !submitted}
	<div role="group" aria-label="Sorrendbe rakható lehetőségek" class="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-white/10 dark:bg-white/5">
		<p class="mb-2 text-xs font-bold text-stone-500 dark:text-stone-400">Lehetőségek</p>
		<div class="flex flex-wrap gap-2">
			{#each remaining as opt (opt)}
				<button
					type="button"
					onclick={() => (chosen = [...chosen, opt])}
					class="min-h-11 max-w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-left text-sm font-medium break-words text-ink-900 transition hover:border-brand-500 hover:bg-brand-50 active:scale-[0.99] dark:border-white/10 dark:bg-stone-900 dark:text-white dark:hover:bg-white/5"
				>
					{opt}
				</button>
			{/each}
			{#if remaining.length === 0}<p class="text-xs text-stone-500 dark:text-stone-400">Minden elemet elhelyeztél. Kattints egy elemre a visszahelyezéshez.</p>{/if}
		</div>
	</div>
	<div class="mt-3 flex gap-2">
		<button
			type="button"
			onclick={() => (chosen = [])}
			disabled={chosen.length === 0}
			class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-4 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-stone-50 dark:hover:bg-white/5 disabled:opacity-50 dark:border-white/10 dark:text-stone-300"
		>
			<RotateCcw size={15} /> Újra
		</button>
		<button
			type="button"
			onclick={() => onAnswer(JSON.stringify(chosen))}
			disabled={chosen.length !== q.options.length || chosen.length === 0}
			class="flex-1 rounded-full bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-50"
		>
			Kész ({chosen.length}/{q.options.length})
		</button>
	</div>
{/if}

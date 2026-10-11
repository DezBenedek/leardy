<script lang="ts">
	import { Check, X } from '@lucide/svelte';
	import type { GameProps } from '../../games/types';

	let { q, onAnswer, picked = null, correct = null }: GameProps = $props();

	function tone(v: string): string {
		if (correct !== null && correct !== undefined) {
			if (v === correct) return 'bg-emerald-500 hover:bg-emerald-500';
			if (picked !== null && picked !== undefined && v === picked) return 'bg-red-500 hover:bg-red-500';
			return 'bg-stone-300 hover:bg-stone-300 dark:bg-white/10 dark:hover:bg-white/10 opacity-60';
		}
		return v === 'Igaz' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600';
	}
</script>

<div class="grid grid-cols-2 gap-2.5">
	{#each q.options as value (value)}
		<button type="button" disabled={picked !== null} onclick={() => onAnswer(value)}
			class={['flex items-center justify-center gap-2 rounded-2xl px-4 py-5 text-lg font-extrabold text-white transition active:scale-[0.98]', tone(value)]}>
			{#if value === 'Igaz'}<Check size={22} strokeWidth={3} aria-hidden="true" />{:else}<X size={22} strokeWidth={3} aria-hidden="true" />{/if}
			{value}
		</button>
	{/each}
</div>

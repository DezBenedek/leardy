<script lang="ts">
	import { Check, X } from '@lucide/svelte';
	import type { GameProps } from './types';

	let { onAnswer, picked = null, correct = null }: GameProps = $props();

	function tone(v: string): string {
		if (correct !== null && correct !== undefined) {
			if (v === correct) return 'bg-emerald-500 hover:bg-emerald-500';
			if (picked !== null && picked !== undefined && v === picked) return 'bg-red-500 hover:bg-red-500';
			return 'bg-stone-300 hover:bg-stone-300 dark:bg-white/10 dark:hover:bg-white/10 opacity-60';
		}
		return v === 'Igaz' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600';
	}
</script>

<!-- Igaz / hamis: két nagy döntőgomb. -->
<div class="grid grid-cols-2 gap-2.5">
	<button
		onclick={() => onAnswer('Igaz')}
		class={['flex items-center justify-center gap-2 rounded-2xl px-4 py-5 text-lg font-extrabold text-white transition active:scale-[0.98]', tone('Igaz')]}
	>
		<Check size={22} strokeWidth={3} /> Igaz
	</button>
	<button
		onclick={() => onAnswer('Hamis')}
		class={['flex items-center justify-center gap-2 rounded-2xl px-4 py-5 text-lg font-extrabold text-white transition active:scale-[0.98]', tone('Hamis')]}
	>
		<X size={22} strokeWidth={3} /> Hamis
	</button>
</div>

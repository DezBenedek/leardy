<script lang="ts">
	import { Check, X } from '@lucide/svelte';
	import type { GameProps } from './types';

	let { onAnswer }: GameProps = $props();
</script>

<!-- Igaz / hamis: két nagy döntőgomb. -->
<div class="grid grid-cols-2 gap-2.5">
	<button
		onclick={() => onAnswer('Igaz')}
		class="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-5 text-lg font-extrabold text-white transition hover:bg-emerald-600 active:scale-[0.98]"
	>
		<Check size={22} strokeWidth={3} /> Igaz
	</button>
	<button
		onclick={() => onAnswer('Hamis')}
		class="flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-5 text-lg font-extrabold text-white transition hover:bg-red-600 active:scale-[0.98]"
	>
		<X size={22} strokeWidth={3} /> Hamis
	</button>
</div>

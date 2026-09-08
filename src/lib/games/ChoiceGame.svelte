<script lang="ts">
	import type { GameProps } from './types';

	let { q, onAnswer, picked = null, correct = null }: GameProps = $props();

	function tone(opt: string): string {
		if (correct !== null && correct !== undefined && opt === correct) {
			return 'border-emerald-500 bg-emerald-50 font-bold text-emerald-800 dark:border-emerald-400 dark:bg-emerald-400/10 dark:text-emerald-200';
		}
		if (picked !== null && picked !== undefined && opt === picked) {
			return 'border-red-500 bg-red-50 font-bold text-red-700 dark:border-red-400 dark:bg-red-400/10 dark:text-red-200';
		}
		return 'border-stone-200 bg-white text-ink-900 hover:border-brand-500 hover:bg-brand-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5';
	}
</script>

<div class="grid gap-2">
	{#each q.options as opt (opt)}
		<button
			onclick={() => onAnswer(opt)}
			class={['rounded-xl border-2 px-4 py-3 text-left text-[15px] font-medium transition active:scale-[0.99]', tone(opt)]}
		>
			{opt}
		</button>
	{/each}
</div>

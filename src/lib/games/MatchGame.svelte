<script lang="ts">
	import type { GameProps } from './types';

	let { q, onAnswer, picked = null, correct = null }: GameProps = $props();

	function tone(opt: string): string {
		if (correct !== null && correct !== undefined && opt === correct) {
			return 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-400/10 dark:text-emerald-200';
		}
		if (picked !== null && picked !== undefined && opt === picked) {
			return 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-400/10 dark:text-red-200';
		}
		return 'border-dashed border-brand-300 bg-brand-50 text-ink-900 hover:border-brand-500 hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-white dark:hover:bg-brand-500/20';
	}
</script>

<!-- Párosítós: mobilon egymás alatt, nagyobban két oszlop. -->
<div class="flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
	<div class="flex items-center justify-center rounded-xl bg-brand-600 px-3 py-4 text-center text-[16px] font-bold text-white">
		{q.left ?? q.question_text}
	</div>
	<div class="grid place-items-center text-xl font-extrabold text-stone-400">
		<span class="rotate-90 sm:rotate-0">→</span>
	</div>
	<div class="grid gap-2">
		{#each q.options as opt (opt)}
			<button
				onclick={() => onAnswer(opt)}
				class={['rounded-xl border-2 px-3 py-3 text-center text-[15px] font-semibold transition active:scale-[0.98]', tone(opt)]}
			>
				{opt}
			</button>
		{/each}
	</div>
</div>

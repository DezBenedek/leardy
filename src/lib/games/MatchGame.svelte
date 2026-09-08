<script lang="ts">
	import type { GameProps } from './types';

	let { q, onAnswer }: GameProps = $props();
</script>

<!-- Párosítós: bal oldal fix, jobb oldalra kell rábökni a párjára. -->
<div class="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
	<div class="flex items-center justify-center rounded-xl bg-ink-900 px-3 py-4 text-center text-[15px] font-bold text-white dark:bg-white dark:text-ink-900">
		{q.left ?? q.question_text}
	</div>
	<div class="grid place-items-center text-xl font-extrabold text-stone-400">→</div>
	<div class="grid gap-2">
		{#each q.options as opt (opt)}
			<button
				onclick={() => onAnswer(opt)}
				class="rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 px-3 py-3 text-center text-[15px] font-semibold text-ink-900 transition hover:border-brand-500 hover:bg-brand-100 active:scale-[0.98] dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-white"
			>
				{opt}
			</button>
		{/each}
	</div>
</div>

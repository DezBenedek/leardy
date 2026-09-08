<script lang="ts">
	import type { GameProps } from './types';

	let { q, onAnswer }: GameProps = $props();
</script>

<div class="grid gap-2">
	{#each q.options as opt (opt)}
		<button
			onclick={() => onAnswer(opt)}
			class="rounded-xl border border-stone-200 bg-white px-4 py-3 text-left text-[15px] font-medium text-ink-900 transition hover:border-brand-500 hover:bg-brand-50 active:scale-[0.99] dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
		>
			{opt}
		</button>
	{/each}
</div>

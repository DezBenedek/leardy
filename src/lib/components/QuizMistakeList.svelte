<script lang="ts">
	import { CircleCheck, CircleX } from '@lucide/svelte';
	import type { QuizMiss } from '$lib/quiz-review';

	let { missed }: { missed: QuizMiss[] } = $props();
</script>

<ul class="grid min-w-0 gap-3">
	{#each missed as mistake, index (index)}
		<li class="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-white/10 dark:bg-stone-900">
			<div class="flex items-start gap-3 px-4 pt-4 pb-3">
				<span class="grid size-7 shrink-0 place-items-center rounded-lg bg-stone-100 text-xs font-extrabold text-stone-500 tabular-nums dark:bg-white/10 dark:text-stone-400">{index + 1}</span>
				<p class="min-w-0 pt-0.5 text-sm leading-relaxed font-bold break-words text-ink-900 dark:text-white">{mistake.question}</p>
			</div>
			<div class="px-4 pb-4">
				<div class="mb-3 pl-1">
					<p class="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-300"><CircleX size={14} class="shrink-0" /> A válaszod</p>
					<p class="mt-1 text-sm leading-relaxed break-words whitespace-pre-line text-stone-500 dark:text-stone-400">{mistake.mine}</p>
				</div>
				<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-400/20 dark:bg-emerald-400/10">
					<p class="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300"><CircleCheck size={15} class="shrink-0" /> Helyes megoldás</p>
					<p class="mt-1.5 text-[15px] leading-relaxed font-extrabold break-words whitespace-pre-line text-emerald-900 dark:text-emerald-100">{mistake.correct}</p>
				</div>
			</div>
		</li>
	{/each}
</ul>

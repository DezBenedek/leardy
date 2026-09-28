<script lang="ts">
	import { CircleCheck, CircleX } from '@lucide/svelte';
	import type { QuizReview } from '$lib/quiz-review';

	/* Utolsó kitöltés átnézete: pontszám + rontott kérdések a helyes válasszal. */
	let { review }: { review: QuizReview | null } = $props();
</script>

{#if review}
	<div>
		<p class="text-[14px] font-extrabold text-ink-900 tabular-nums dark:text-white">
			Utolsó kitöltésed: {review.score}/{review.total} ({review.pct}%)
		</p>
		{#if review.missed.length === 0}
			<p class="mt-1 flex items-center gap-1.5 text-[13px] font-bold text-emerald-700 dark:text-emerald-300">
				<CircleCheck size={15} /> Mind helyes!
			</p>
		{:else}
			<ul class="mt-2 grid min-w-0 gap-1.5 overflow-hidden">
				{#each review.missed as m, i (i)}
					<li class="min-w-0 rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/10">
						<p class="flex items-start gap-1.5 text-[13px] font-bold text-ink-900 dark:text-white">
							<CircleX size={15} class="mt-0.5 shrink-0 text-red-500" />
							<span class="min-w-0">{m.question}</span>
						</p>
						<p class="mt-1 truncate text-[13px] text-stone-500 dark:text-stone-400">
							Te: {m.mine}
						</p>
						<p class="text-[13px] font-bold text-emerald-700 dark:text-emerald-300">
							Helyes: {m.correct}
						</p>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

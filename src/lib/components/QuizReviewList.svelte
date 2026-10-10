<script lang="ts">
	import { CircleCheck } from '@lucide/svelte';
	import type { QuizReview } from '$lib/quiz-review';
	import QuizMistakeList from './QuizMistakeList.svelte';

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
			<div class="mt-3"><QuizMistakeList missed={review.missed} /></div>
		{/if}
	</div>
{/if}

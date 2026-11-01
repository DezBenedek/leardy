<script lang="ts">
	import Drawer from '$lib/components/Drawer.svelte';
	import type { QuizQuestion } from '$lib/curriculum/curriculum';
	import { CircleCheck, CircleX } from '@lucide/svelte';
	import { prettyAnswer } from './live-format';
	import type { LiveStudentDetail } from './live-types';

	interface Props {
		open: boolean;
		entry: LiveStudentDetail | null;
		questions: QuizQuestion[];
		onClose: () => void;
	}

	let { open, entry, questions, onClose }: Props = $props();
</script>

<Drawer
	{open}
	label="Diák részletei"
	title={entry?.name ?? 'Diák'}
	onClose={onClose}
>
	{#if entry}
		{@const detailOk = entry.answers.filter((a) => a.ok).length}
		<p class="text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
			Sikeres: {detailOk}/{questions.length} · Leadva: {entry.answers.length}
		</p>
		<div class="mt-3 grid gap-2">
			{#each questions as q, qi (q.id)}
				{@const a = entry.answers.find((x) => x.index === qi)}
				<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
					<p class="text-[12px] font-extrabold tracking-wider text-stone-400 uppercase tabular-nums dark:text-stone-500">
						{qi + 1}. kérdés
					</p>
					<p class="mt-1 text-[15px] font-extrabold text-ink-900 dark:text-white">{q.question_text}</p>
					{#if a}
						<p class={['mt-2 flex items-start gap-1.5 text-[14px] font-bold', a.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300']}>
							{#if a.ok}
								<CircleCheck size={17} class="mt-0.5 shrink-0" aria-hidden="true" />
							{:else}
								<CircleX size={17} class="mt-0.5 shrink-0" aria-hidden="true" />
							{/if}
							<span class="min-w-0 break-words">Válasza: {prettyAnswer(questions, qi, a.answer)}</span>
						</p>
						{#if !a.ok}
							<p class="mt-1 pl-6 text-[13px] font-semibold text-stone-500 break-words dark:text-stone-400">
								Helyes: {prettyAnswer(questions, qi, q.correct_answer)}
							</p>
						{/if}
					{:else}
						<p class="mt-2 text-[14px] font-semibold text-stone-400 dark:text-stone-500">Még nem válaszolt.</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</Drawer>

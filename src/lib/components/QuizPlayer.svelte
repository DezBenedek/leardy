<script lang="ts">
	import { CheckCircle2, XCircle } from '@lucide/svelte';
	import type { QuizQ } from '$lib/study';

	interface Props {
		questions: QuizQ[];
		/** Ha false: gyakorlás végén nincs megoldás-mutatás (éles dolgozat). */
		reveal?: boolean;
		submitLabel?: string;
		onFinish: (score: number, total: number, answers: Record<string, string>) => void;
	}

	let { questions, reveal = true, submitLabel = 'Befejezés', onFinish }: Props = $props();

	let index = $state(0);
	let answers = $state<Record<string, string>>({});
	let text = $state('');
	let done = $state(false);

	let q = $derived(questions[index]);
	let score = $derived(
		reveal ? questions.filter((x) => answers[x.id] === x.correct_answer).length : 0
	);

	function choose(value: string) {
		if (!q || done) return;
		answers[q.id] = value;
		next();
	}

	function submitText() {
		if (!q || done) return;
		answers[q.id] = text.trim();
		text = '';
		next();
	}

	function next() {
		if (index + 1 >= questions.length) {
			done = true;
			onFinish(score, questions.length, { ...answers });
		} else {
			index++;
		}
	}

	function restart() {
		index = 0;
		answers = {};
		text = '';
		done = false;
	}
</script>

{#if questions.length === 0}
	<p class="text-sm text-stone-500 dark:text-stone-400">Ehhez nincs kérdés.</p>
{:else if !done && q}
	<p class="text-xs font-semibold text-ink-400 dark:text-stone-500">{index + 1} / {questions.length}</p>
	<div class="mt-2 rounded-2xl border border-stone-200 bg-stone-100 p-5 dark:border-white/10 dark:bg-white/5">
		{#if q.type === 'match' && q.left}
			<p class="text-[13px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Párosítás</p>
			<p class="mt-1 text-xl font-extrabold text-ink-900 dark:text-white">{q.left} → ?</p>
		{:else}
			<p class="text-xl font-extrabold text-ink-900 dark:text-white">{q.question_text}</p>
		{/if}
	</div>
	{#if q.type === 'text'}
		<form
			onsubmit={(e) => {
				e.preventDefault();
				submitText();
			}}
			class="mt-3 flex gap-2"
		>
			<input
				bind:value={text}
				placeholder="Írd be a választ…"
				autocomplete="off"
				class="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
			/>
			<button
				type="submit"
				class="shrink-0 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
			>
				Tovább
			</button>
		</form>
	{:else}
		<div class="mt-3 grid gap-2">
			{#each q.options as opt (opt)}
				<button
					onclick={() => choose(opt)}
					class="rounded-xl border border-stone-200 bg-white px-4 py-3 text-left text-[15px] font-medium text-ink-900 transition hover:border-brand-500 hover:bg-brand-50 active:scale-[0.99] dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
				>
					{opt}
				</button>
			{/each}
		</div>
	{/if}
{:else}
	<div class="rounded-2xl border border-stone-200 bg-stone-100 p-5 text-center dark:border-white/10 dark:bg-white/5">
		{#if reveal}
			<p class="font-display text-[28px] font-extrabold text-ink-900 dark:text-white">
				{score} / {questions.length}
			</p>
			<ul class="mt-3 space-y-1.5 text-left">
				{#each questions as x (x.id)}
					{@const ok = answers[x.id] === x.correct_answer}
					<li class="flex items-start gap-2 text-sm {ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}">
						{#if ok}
							<CheckCircle2 size={17} class="mt-0.5 shrink-0" />
						{:else}
							<XCircle size={17} class="mt-0.5 shrink-0" />
						{/if}
						<span>
							{x.type === 'match' && x.left ? `${x.left} → ` : ''}{x.question_text}
							{#if !ok}<span class="block text-ink-600 dark:text-stone-400">Helyes: {x.correct_answer}</span>{/if}
						</span>
					</li>
				{/each}
			</ul>
			<button
				onclick={restart}
				class="mt-4 rounded-full border border-stone-300 px-5 py-2 text-sm font-semibold text-ink-600 transition hover:bg-white dark:border-white/15 dark:text-stone-300"
			>
				Újra
			</button>
		{:else}
			<p class="font-display text-[22px] font-extrabold text-ink-900 dark:text-white">{submitLabel}</p>
			<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">A válaszokat rögzítettük.</p>
		{/if}
	</div>
{/if}

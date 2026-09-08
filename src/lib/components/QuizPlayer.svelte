<script lang="ts">
	import { CheckCircle2, XCircle } from '@lucide/svelte';
	import { gameFor } from '$lib/games/registry';
	import type { QuizQ } from '$lib/study';

	interface Props {
		questions: QuizQ[];
		/** Ha false: gyakorlás végén nincs megoldás-mutatás (éles dolgozat). */
		reveal?: boolean;
		submitLabel?: string;
		/** Külső jelzés (pl. időkorlát): azonnali befejezés az eddigi válaszokkal. */
		forceDone?: boolean;
		onFinish: (score: number, total: number, answers: Record<string, string>) => void;
	}

	let { questions, reveal = true, submitLabel = 'Befejezés', forceDone = false, onFinish }: Props = $props();

	let index = $state(0);
	let answers = $state<Record<string, string>>({});
	let done = $state(false);

	let q = $derived(questions[index]);
	let Game = $derived(q ? gameFor(q.type) : gameFor('choice'));

	function isCorrect(x: QuizQ): boolean {
		return (answers[x.id] ?? '') !== '' && answers[x.id] === x.correct_answer;
	}

	let score = $derived(reveal ? questions.filter(isCorrect).length : 0);

	function answer(value: string) {
		if (!q || done) return;
		answers[q.id] = value;
		if (index + 1 >= questions.length) finish();
		else index++;
	}

	function finish() {
		if (done) return;
		done = true;
		onFinish(score, questions.length, { ...answers });
	}

	$effect(() => {
		if (forceDone && !done && questions.length > 0) finish();
	});

	function restart() {
		index = 0;
		answers = {};
		done = false;
	}

	/** JSON-tömb válasz (sorrendbe rakós) olvasható formában. */
	function fmtAnswer(s: string): string {
		try {
			const p: unknown = JSON.parse(s);
			if (Array.isArray(p)) return p.map(String).join(' → ');
		} catch {
			// sima szöveg
		}
		return s === '' ? '—' : s;
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
		{:else if q.type === 'order'}
			<p class="text-[13px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Sorrend</p>
			<p class="mt-1 text-xl font-extrabold text-ink-900 dark:text-white">{q.question_text}</p>
		{:else if q.type === 'tf'}
			<p class="text-[13px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Igaz / hamis</p>
			<p class="mt-1 text-xl font-extrabold text-ink-900 dark:text-white">{q.question_text}</p>
		{:else}
			<p class="text-xl font-extrabold text-ink-900 dark:text-white">{q.question_text}</p>
		{/if}
	</div>
	<div class="mt-3">
		{#key q.id}
			<Game q={{ id: q.id, question_text: q.question_text, type: q.type, options: q.options, left: q.left }} onAnswer={answer} />
		{/key}
	</div>
{:else if done}
	<div class="rounded-2xl border border-stone-200 bg-stone-100 p-5 text-center dark:border-white/10 dark:bg-white/5">
		{#if reveal}
			<p class="font-display text-[28px] font-extrabold text-ink-900 dark:text-white">
				{score} / {questions.length}
			</p>
			<ul class="mt-3 space-y-1.5 text-left">
				{#each questions as x (x.id)}
					{@const ok = isCorrect(x)}
					<li class="flex items-start gap-2 text-sm {ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}">
						{#if ok}
							<CheckCircle2 size={17} class="mt-0.5 shrink-0" />
						{:else}
							<XCircle size={17} class="mt-0.5 shrink-0" />
						{/if}
						<span>
							{x.type === 'match' && x.left ? `${x.left} → ` : ''}{x.question_text}
							{#if !ok}<span class="block text-ink-600 dark:text-stone-400">Helyes: {fmtAnswer(x.correct_answer)}</span>{/if}
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

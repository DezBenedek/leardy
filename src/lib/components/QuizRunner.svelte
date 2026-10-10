<script lang="ts">
	import QuestionImage from '$lib/components/quiz/QuestionImage.svelte';
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { ArrowRight, ChevronDown, LogOut, RotateCcw, CircleCheck, CircleX, Trophy } from '@lucide/svelte';
	import type { QuizQuestion } from '$lib/curriculum';
	import { correctQuizAnswer as correctOf, isQuizAnswerCorrect as isCorrect, formatQuizAnswer } from '$lib/quiz-answers';
	import { gameFor } from '$lib/question-types/components';
	import { prepareQuestion } from '$lib/question-types/registry';
	import type { GameQuestion } from '$lib/games/types';
	import { ADV_MISS_MS, ADV_OK_MS } from '$lib/practice';
	import Button from '$lib/ui/Button.svelte';
	import QuizMistakeList from './QuizMistakeList.svelte';

	/* Egy kérdés / nézet: válasz után azonnali visszajelzés,
	   automata-tovább (jó: 0.7 mp, rossz: 3 mp) + Tovább gomb, a végén eredmény. */

	export interface QuizMiss {
		question: string;
		mine: string;
		correct: string;
	}

	interface Props {
		questions: QuizQuestion[];
		title: string;
		/** Osztályfeladat célja (ha van): a végén mutatja, teljesült-e. */
		targetPct?: number | null;
		/** Bezárja a kvízt a záróképernyő Kilépés gombjáról. */
		onExit?: () => void;
		/** A végén hívódik meg (score, total, rontott kérdések), például progress-mentéshez. */
		onDone?: (score: number, total: number, missed?: QuizMiss[]) => void;
	}

	let { questions, title, targetPct = null, onExit, onDone }: Props = $props();

	const reduced = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const reviewId = $props.id();

	let idx = $state(0);
	let answers = $state<Record<string, string>>({});
	let finished = $state(false);
	let notified = $state(false);
	let reviewOpen = $state(false);
	let autoTimer: ReturnType<typeof setTimeout> | undefined;
	/** Az automata-tovább hátralévő ideje (a csík is ehhez igazodik). */
	let autoMs = $state(ADV_MISS_MS);
	/** A futam elején keverünk, válaszadás közben az elemek sorrendje stabil. */
	let gameQuestions = $state<Record<string, GameQuestion>>({});

	let current = $derived(questions[Math.min(idx, questions.length - 1)]);
	let answered = $derived(
		current && answers[current.id] !== undefined ? answers[current.id] : undefined
	);

	// Új kérdéssor → elejéről, új kevert sorrenddel. Untrack kell: csak a
	// kérdéssor válthatja ki újra, a belső állapotok nem (fagyás).
	$effect(() => {
		void questions.length;
		void questions.map((q) => q.id).join(',');
		untrack(() => {
			clearAuto();
			idx = 0;
			answers = {};
			finished = false;
			notified = false;
			reviewOpen = false;
			prepareRun();
		});
	});

	// Unmountkor az időzítő sem maradhat.
	$effect(() => {
		return () => clearAuto();
	});

	$effect(() => {
		if (finished && !notified && questions.length > 0) {
			notified = true;
			onDone?.(score, questions.length, missed);
		}
	});

	function clearAuto() {
		if (autoTimer !== undefined) {
			clearTimeout(autoTimer);
			autoTimer = undefined;
		}
	}

	function prepareRun() {
		gameQuestions = Object.fromEntries(questions.map((question) => [question.id, prepareQuestion(question)]));
	}

	let score = $derived(questions.filter((q) => isCorrect(q, answers[q.id])).length);
	let pct = $derived(questions.length > 0 ? Math.round((score / questions.length) * 100) : 0);

	/** Rontott kérdések: mit válaszolt és mi a helyes (záróképernyő + drawer-átnézet). */
	let missed = $derived(
		questions
			.filter((q) => !isCorrect(q, answers[q.id]))
			.map((q) => ({ question: q.question_text, mine: prettyMine(q), correct: prettyCorrect(q) }))
	);

	/** Rövid szövegű sornál keskenyebb az oszlop (450px), egyébként max 550px. */
	let compact = $derived(
		questions.length > 0 &&
			questions.every((q) => (q.question_text.length + correctOf(q).length) < 60)
	);

	function answer(a: string) {
		if (!current || answers[current.id] !== undefined || finished) return;
		answers[current.id] = a;
		clearAuto();
		autoMs = isCorrect(current, a) ? ADV_OK_MS : ADV_MISS_MS;
		autoTimer = setTimeout(next, autoMs);
	}

	function next() {
		clearAuto();
		if (idx >= questions.length - 1) finished = true;
		else idx += 1;
	}

	function retry() {
		clearAuto();
		idx = 0;
		answers = {};
		finished = false;
		notified = false;
		reviewOpen = false;
		prepareRun();
	}

	function prettyCorrect(q: QuizQuestion): string {
		return formatQuizAnswer(q, correctOf(q));
	}

	function prettyMine(q: QuizQuestion): string {
		const ans = answers[q.id];
		if (ans === undefined) return 'nincs válasz';
		return formatQuizAnswer(q, ans);
	}
</script>

{#if questions.length === 0}
	<p class="py-4 text-center text-sm font-medium text-stone-500 dark:text-stone-400">Nincs kérdés.</p>
{:else if finished}
	<div class="mx-auto flex min-h-[calc(100dvh-140px)] w-full max-w-[480px] flex-col justify-center py-6 sm:py-10">
		<section aria-label="Kvíz eredménye" class="relative overflow-hidden rounded-[28px] border border-brand-100 bg-brand-50 px-5 pt-7 pb-6 text-center shadow-xl shadow-brand-500/5 sm:px-8 dark:border-brand-500/20 dark:bg-brand-500/10 dark:shadow-none">
			<div class="relative mx-auto grid size-44 place-items-center">
				<svg class="absolute inset-0 size-full -rotate-90" viewBox="0 0 176 176" fill="none" aria-hidden="true">
					<circle cx="88" cy="88" r="78" stroke="currentColor" stroke-width="9" class="text-brand-500/10 dark:text-white/10" />
					<circle cx="88" cy="88" r="78" stroke="currentColor" stroke-width="9" stroke-linecap={pct > 0 ? 'round' : 'butt'} pathLength="100" stroke-dasharray={`${pct} 100`} class="text-brand-500 dark:text-indigo-400" />
				</svg>
				<p class="font-display text-[52px] leading-none font-extrabold tracking-tight text-ink-900 tabular-nums dark:text-white">{pct}%</p>
				{#if score === questions.length}
					<span class="absolute right-0 bottom-1 grid size-11 place-items-center rounded-2xl border-4 border-brand-50 bg-brand-500 text-white dark:border-stone-950"><Trophy size={21} /></span>
				{/if}
			</div>
			<h2 class="mt-5 font-display text-[28px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
				{score === questions.length ? 'Hibátlan!' : pct >= 80 ? 'Szép munka!' : 'Kvíz befejezve'}
			</h2>
			<p class="mt-2 text-sm font-medium text-ink-600 dark:text-stone-300"><span class="font-extrabold text-ink-900 tabular-nums dark:text-white">{score}/{questions.length}</span> helyes válasz</p>
			{#if targetPct !== null}
				{@const met = pct >= targetPct}
				<p class={['mx-auto mt-4 flex w-fit items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold', met ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300' : 'bg-white/80 text-ink-600 dark:bg-white/10 dark:text-stone-300']}>
					{#if met}<CircleCheck size={14} /> Cél teljesítve{:else}<CircleX size={14} /> Cél: {targetPct}%{/if}
				</p>
			{/if}
		</section>

		{#if missed.length > 0}
			<div class="quiz-mistakes mt-4 rounded-2xl border border-stone-200 bg-stone-50 dark:border-white/10 dark:bg-white/5">
				<button type="button" aria-expanded={reviewOpen} aria-controls={reviewId} onclick={() => (reviewOpen = !reviewOpen)} class="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left outline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-500">
					<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-red-100 text-red-600 dark:bg-red-400/10 dark:text-red-300"><CircleX size={19} /></span>
					<span class="min-w-0 flex-1 text-sm font-extrabold text-ink-900 dark:text-white">Mit rontottam?</span>
					<span class="text-sm font-bold text-stone-500 tabular-nums dark:text-stone-400">{missed.length}</span>
					<ChevronDown size={18} class="review-chevron shrink-0 text-stone-500 dark:text-stone-400" />
				</button>
				<div id={reviewId} class={['review-content', reviewOpen && 'review-content-open']} inert={!reviewOpen} aria-hidden={!reviewOpen}>
					<div class="min-h-0 overflow-hidden">
						<div class="px-3 pb-3"><QuizMistakeList {missed} /></div>
					</div>
				</div>
			</div>
		{/if}

		<div class="mt-6 grid gap-2">
			{#if onExit}
				<Button size="lg" block onclick={onExit}>Kilépés <LogOut size={17} /></Button>
			{/if}
			<Button variant={onExit ? 'ghost' : 'primary'} size="lg" block onclick={retry}><RotateCcw size={16} /> Újrapróbálom</Button>
		</div>
	</div>
{:else if current}
	{@const Game = gameFor(current.type)}
	{@const ok = answered !== undefined && isCorrect(current, answered)}
	<div class="mx-auto flex min-h-[calc(100dvh-140px)] w-full flex-col">
		<div class="flex items-center gap-3">
			<div
				class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10"
				role="progressbar"
				aria-valuenow={idx + 1}
				aria-valuemin={0}
				aria-valuemax={questions.length}
				aria-label="Haladás"
			>
				<div
					class="h-full rounded-full bg-brand-500 transition-all duration-300 motion-reduce:transition-none"
					style="width: {((idx + 1) / questions.length) * 100}%"
				></div>
			</div>
			<p class="shrink-0 text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
				{idx + 1}/{questions.length}
			</p>
		</div>

		<div class="grid flex-1 place-items-center pt-4 pb-24">
			<div class={['w-full', compact ? 'max-w-[450px]' : 'max-w-[550px]']}>
				{#key current.id}
					<p class="text-[18px] leading-snug font-extrabold text-balance text-ink-900 sm:text-[20px] dark:text-white">
						{current.question_text}
					</p>
					{#if current.imageUrl && current.type !== 'map'}<div class="mt-3"><QuestionImage src={current.imageUrl} /></div>{/if}
					<div class="mt-3">
						{#if gameQuestions[current.id]}
							<Game
								q={gameQuestions[current.id]}
								onAnswer={answer}
								picked={answered ?? null}
								correct={answered !== undefined ? correctOf(current) : null}
							/>
						{/if}
					</div>
				{/key}

				{#if answered !== undefined}
					<p class={['mt-3 flex items-start gap-1.5 text-[14px] font-semibold', ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300']}>
						{#if ok}
							<CircleCheck size={17} class="mt-0.5 shrink-0" /> Helyes!
						{:else}
							<CircleX size={17} class="mt-0.5 shrink-0" />
							<span>Helyes válasz: {prettyCorrect(current)}</span>
						{/if}
					</p>
					{#if !reduced}
						<div
							class="mt-3 h-1 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10"
							aria-hidden="true"
						>
							{#key current.id + (answered ?? '')}
								<div class="anim-auto-fill h-full rounded-full bg-brand-500" style="animation-duration: {autoMs}ms"></div>
							{/key}
						</div>
					{/if}
					<div class="mt-3">
						<Button size="lg" block onclick={next}>
							{idx >= questions.length - 1 ? 'Eredmény' : 'Tovább'} <ArrowRight size={17} />
						</Button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.review-content {
		display: grid;
		grid-template-rows: 0fr;
		opacity: 0;
		transition: grid-template-rows 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease;
	}
	.review-content-open { grid-template-rows: 1fr; opacity: 1; }
	.quiz-mistakes :global(.review-chevron) { transition: transform 300ms ease; }
	.quiz-mistakes button[aria-expanded='true'] :global(.review-chevron) { transform: rotate(180deg); }
	@media (prefers-reduced-motion: reduce) {
		.review-content, .quiz-mistakes :global(.review-chevron) { transition: none; }
	}
</style>

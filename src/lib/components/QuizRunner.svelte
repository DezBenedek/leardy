<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { ArrowRight, Eye, RotateCcw, CircleCheck, CircleX } from '@lucide/svelte';
	import type { QuizQuestion } from '$lib/curriculum';
	import { gameFor } from '$lib/games/registry';
	import type { GameQuestion } from '$lib/games/types';
	import { ADV_MISS_MS, ADV_OK_MS } from '$lib/practice';
	import Button from '$lib/ui/Button.svelte';

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
		/** Ha adott, a "Mit rontottam?" gomb ezt hívja (pl. drawernyitás az átnézettel)
		    az inline lista helyett. */
		onReview?: () => void;
		/** A végén hívódik meg (score, total, rontott kérdések), például progress-mentéshez. */
		onDone?: (score: number, total: number, missed?: QuizMiss[]) => void;
	}

	let { questions, title, targetPct = null, onReview, onDone }: Props = $props();

	const reduced = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	let idx = $state(0);
	let answers = $state<Record<string, string>>({});
	let finished = $state(false);
	let notified = $state(false);
	let autoTimer: ReturnType<typeof setTimeout> | undefined;
	/** Az automata-tovább hátralévő ideje (a csík is ehhez igazodik). */
	let autoMs = $state(ADV_MISS_MS);
	/** Minden futam (új kérdéssor, újra) új véletlen opciósorrendet kap. */
	let runId = $state(0);

	function shuffle<T>(arr: T[]): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	/** Kérdés-id → kevert megjelenítési sorrend. Csak a futam elején
	    dől el (runId + kérdéssor), válaszadás/léptetés közben stabil. */
	let orderMap = $derived.by(() => {
		void runId;
		const m: Record<string, string[]> = {};
		for (const q of questions) {
			if (q.type === 'choice' || q.type === 'match' || q.type === 'order') {
				const base = q.options.length > 0 ? q.options : q.pairs.map((p) => p.right);
				m[q.id] = shuffle(base);
			}
		}
		return m;
	});

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
			runId += 1;
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

	/** QuizQuestion → a games-registry által várt GameQuestion alak.
	    A choice/match/order opciók mindig kevert sorrendben jelennek meg,
	    a kiértékelés érték-alapú, ezért a keverés nem töri el. */
	function toGameQuestion(q: QuizQuestion): GameQuestion {
		const base = q.options.length > 0 ? q.options : q.pairs.map((p) => p.right);
		return {
			id: q.id,
			question_text: q.question_text,
			type: q.type,
			options: orderMap[q.id] ?? base,
			left: q.pairs[0]?.left
		};
	}

	/** A tényleges helyes válasz (a match párok első jobb oldala). */
	function correctOf(q: QuizQuestion): string {
		if (q.type === 'match') return q.pairs[0]?.right ?? '';
		return q.correct_answer;
	}

	function norm(q: QuizQuestion, v: string): string {
		const t = v.trim();
		return q.type === 'text' || q.type === 'tf' ? t.toLowerCase() : t;
	}

	function isCorrect(q: QuizQuestion, ans: string | undefined): boolean {
		if (ans === undefined) return false;
		const want = correctOf(q);
		if (q.type === 'order') {
			try {
				return JSON.stringify(JSON.parse(ans)) === JSON.stringify(JSON.parse(want));
			} catch {
				return norm(q, ans) === norm(q, want);
			}
		}
		return norm(q, ans) === norm(q, want);
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
		runId += 1;
	}

	function prettyCorrect(q: QuizQuestion): string {
		if (q.type === 'order') {
			try {
				const p: unknown = JSON.parse(correctOf(q));
				if (Array.isArray(p)) return p.map(String).join(' → ');
			} catch {
				// nyers szövegre esik vissza
			}
		}
		return correctOf(q);
	}

	function prettyMine(q: QuizQuestion): string {
		const ans = answers[q.id];
		if (ans === undefined) return 'nincs válasz';
		if (q.type === 'order') {
			try {
				const p: unknown = JSON.parse(ans);
				if (Array.isArray(p)) return p.map(String).join(' → ');
			} catch {
				// nyers szövegre esik vissza
			}
		}
		return ans;
	}
</script>

{#if questions.length === 0}
	<p class="py-4 text-center text-sm font-medium text-stone-500 dark:text-stone-400">Nincs kérdés.</p>
{:else if finished}
	<div class="mx-auto grid min-h-[calc(100dvh-140px)] w-full max-w-[550px] place-items-center pt-4 pb-24">
		<div class="w-full rounded-[20px] bg-stone-100 p-6 text-center sm:p-8 dark:bg-white/5">
			<p class="font-display text-[44px] leading-none font-extrabold text-ink-900 tabular-nums dark:text-white">
				{pct}%
			</p>
			<p class="mt-2 text-sm font-bold text-stone-600 tabular-nums dark:text-stone-300">
				{#if score === questions.length}
					Mind helyes ({score}/{questions.length})
				{:else}
					{score}/{questions.length} helyes
				{/if}
			</p>
			{#if targetPct !== null}
				{@const met = pct >= targetPct}
				<p class={['mt-1.5 flex items-center justify-center gap-1.5 text-[14px] font-bold', met ? 'text-emerald-600 dark:text-emerald-300' : 'text-stone-500 dark:text-stone-400']}>
					{#if met}
						<CircleCheck size={16} /> Cél teljesítve ({targetPct}%)
					{:else}
						<CircleX size={16} /> Cél: {targetPct}% - próbáld újra!
					{/if}
				</p>
			{/if}
			{#if missed.length > 0 && onReview}
				<div class="mt-4 flex justify-center">
					<Button variant="outline" onclick={onReview}>
						<Eye size={16} /> Mit rontottam? ({missed.length})
					</Button>
				</div>
			{/if}
			{#if missed.length > 0 && !onReview}
				<details class="mt-4 text-left">
					<summary class="cursor-pointer text-[14px] font-extrabold text-ink-900 dark:text-white">
						Mit rontottam? ({missed.length})
					</summary>
					<ul class="mt-2 grid gap-1.5">
						{#each missed as m, i (i)}
							<li class="rounded-xl bg-white px-3 py-2 dark:bg-white/10">
								<p class="text-[13px] font-bold text-ink-900 dark:text-white">{m.question}</p>
								<p class="mt-0.5 truncate text-[13px] text-stone-500 dark:text-stone-400">
									Te: {m.mine}
								</p>
								<p class="text-[13px] font-bold text-emerald-700 dark:text-emerald-300">
									Helyes: {m.correct}
								</p>
							</li>
						{/each}
					</ul>
				</details>
			{/if}
			<div class="mt-4 flex justify-center">
				<Button variant="outline" onclick={retry}>
					<RotateCcw size={16} /> Újra
				</Button>
			</div>
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
					<div class="mt-3">
						<Game
							q={toGameQuestion(current)}
							onAnswer={answer}
							picked={answered ?? null}
							correct={answered !== undefined ? correctOf(current) : null}
						/>
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

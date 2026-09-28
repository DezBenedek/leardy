<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { ArrowRight, CircleCheck, CircleX, RotateCcw } from '@lucide/svelte';
	import type { QuizQuestion } from '$lib/curriculum';
	import { ADV_MISS_MS, ADV_OK_MS } from '$lib/practice';
	import Button from '$lib/ui/Button.svelte';

	/* Teszt: beírós számonkérés. Előlap a kérdés, beírod a hátlapot,
	   azonnali visszajelzés, a végén pontszám. */

	interface Props {
		questions: QuizQuestion[];
		onMark?: (key: string, known: boolean) => void;
		/** A végén hívódik meg (score, total), például progress-mentéshez. */
		onDone?: (score: number, total: number) => void;
	}

	let { questions, onMark, onDone }: Props = $props();

	const reduced = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	/** Kis/nagybetű, felesleges szóköz és záró írásjel nem számít. */
	function norm(v: string): string {
		return v.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,;:]+$/g, '');
	}

	function shuffle<T>(arr: T[]): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	let order = $state<QuizQuestion[]>([]);
	let idx = $state(0);
	let value = $state('');
	let checked = $state(false);
	let firstTry = $state<boolean[]>([]);
	let finished = $state(false);
	let notified = $state(false);
	let autoTimer: ReturnType<typeof setTimeout> | undefined;
	/** Az automata-tovább hátralévő ideje (a csík is ehhez igazodik). */
	let autoMs = $state(ADV_MISS_MS);

	function clearAuto() {
		if (autoTimer !== undefined) {
			clearTimeout(autoTimer);
			autoTimer = undefined;
		}
	}

	function reset() {
		clearAuto();
		order = shuffle(
			questions.filter((q) => q.question_text.trim() && q.correct_answer.trim())
		);
		idx = 0;
		value = '';
		checked = false;
		firstTry = [];
		finished = false;
		notified = false;
	}

	// Új kérdéssor → elejéről. Untrack kell: a reset belső állapotokat
	// is érint, és azok nem válthatják ki újra az effectet (fagyás).
	$effect(() => {
		void questions.length;
		untrack(() => reset());
	});

	$effect(() => {
		if (finished && !notified && order.length > 0) {
			notified = true;
			onDone?.(score, order.length);
		}
	});

	// Unmountkor az időzítő sem maradhat.
	$effect(() => {
		return () => clearAuto();
	});

	let current = $derived(order[Math.min(idx, order.length - 1)]);
	let correct = $derived(current ? norm(value) === norm(current.correct_answer) : false);
	let score = $derived(firstTry.filter(Boolean).length);

	/** Rövid szövegű sornál keskenyebb az oszlop (450px), egyébként max 550px. */
	let compact = $derived(
		questions.length > 0 &&
			questions.every(
				(q) => (q.question_text.trim().length + (q.correct_answer?.trim().length ?? 0)) < 60
			)
	);

	function check() {
		if (!current || checked || finished || !norm(value)) return;
		const ok = norm(value) === norm(current.correct_answer);
		checked = true;
		firstTry = [...firstTry, ok];
		onMark?.(current.id, ok);
		clearAuto();
		autoMs = ok ? ADV_OK_MS : ADV_MISS_MS;
		autoTimer = setTimeout(next, autoMs);
	}

	function next() {
		clearAuto();
		if (idx >= order.length - 1) finished = true;
		else {
			idx += 1;
			value = '';
			checked = false;
		}
	}
</script>

{#if order.length === 0}
	<p class="py-4 text-center text-sm font-medium text-stone-500 dark:text-stone-400">Nincs kártya.</p>
{:else if finished}
	<div class="mx-auto grid min-h-[calc(100dvh-140px)] w-full max-w-[550px] place-items-center pt-4 pb-24">
		<div class="w-full rounded-[20px] bg-stone-100 p-6 text-center sm:p-8 dark:bg-white/5">
			<p class="font-display text-[30px] leading-none font-extrabold text-ink-900 tabular-nums dark:text-white">
				{score}/{order.length}
			</p>
			<p class="mt-2 text-sm font-medium text-stone-500 dark:text-stone-400">
				{#if score === order.length}
					Mind helyes.
				{:else if score === 0}
					Egy sem lett helyes.
				{:else}
					{score} helyes, {order.length - score} hibás.
				{/if}
			</p>
			<div class="mt-4 flex justify-center">
				<Button variant="outline" onclick={reset}>
					<RotateCcw size={16} /> Újra
				</Button>
			</div>
		</div>
	</div>
{:else if current}
	<div class="mx-auto flex min-h-[calc(100dvh-140px)] w-full flex-col">
		<div class="flex items-center gap-3">
			<div
				class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10"
				role="progressbar"
				aria-valuenow={idx + 1}
				aria-valuemin={0}
				aria-valuemax={order.length}
				aria-label="Haladás"
			>
				<div
					class="h-full rounded-full bg-brand-500 transition-all duration-300 motion-reduce:transition-none"
					style="width: {((idx + 1) / order.length) * 100}%"
				></div>
			</div>
			<p class="shrink-0 text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
				{idx + 1}/{order.length}
			</p>
		</div>

		<div class="grid flex-1 place-items-center pt-4 pb-24">
			<div class={['w-full', compact ? 'max-w-[450px]' : 'max-w-[550px]']}>
				{#key current.id}
					<div class="rounded-[20px] border border-stone-200 bg-white p-5 text-center sm:p-6 dark:border-white/10 dark:bg-stone-900">
						<p class="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">
							Írd be a párját
						</p>
						<p class="font-display mt-1.5 text-[24px] leading-snug font-extrabold text-balance text-ink-900 sm:text-[26px] dark:text-white">
							{current.question_text}
						</p>
					</div>
					<form
						class="mt-3"
						onsubmit={(e) => {
							e.preventDefault();
							if (checked) next();
							else check();
						}}
					>
						<input
							bind:value
							disabled={checked}
							placeholder="Ide írd a választ…"
							aria-label="Válasz"
							autocomplete="off"
							class={[
								'w-full rounded-2xl border-2 bg-white px-4 py-3 text-center text-[16px] font-bold text-ink-900 outline-none transition placeholder:font-medium placeholder:text-stone-400 motion-reduce:transition-none dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500',
								!checked
									? 'border-stone-200 focus:border-brand-500 dark:border-white/10 dark:focus:border-brand-500'
									: correct
										? 'border-emerald-500'
										: 'border-red-500'
							]}
						/>
						{#if !checked}
							<div class="mt-3">
								<Button type="submit" size="lg" block disabled={!norm(value)}>Ellenőrzés</Button>
							</div>
						{:else}
							<p class={['mt-3 flex items-start justify-center gap-1.5 text-[14px] font-semibold', correct ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300']}>
								{#if correct}
									<CircleCheck size={17} class="mt-0.5 shrink-0" /> Helyes!
								{:else}
									<CircleX size={17} class="mt-0.5 shrink-0" />
									<span>Helyes válasz: {current.correct_answer}</span>
								{/if}
							</p>
							{#if !reduced}
								<div class="mt-3 h-1 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10" aria-hidden="true">
									<div class="anim-auto-fill h-full rounded-full bg-brand-500" style="animation-duration: {autoMs}ms"></div>
								</div>
							{/if}
							<div class="mt-3">
								<Button size="lg" block onclick={next}>
									{idx >= order.length - 1 ? 'Eredmény' : 'Tovább'} <ArrowRight size={17} />
								</Button>
							</div>
						{/if}
					</form>
				{/key}
			</div>
		</div>
	</div>
{/if}

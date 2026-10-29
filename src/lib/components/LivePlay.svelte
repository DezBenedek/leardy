<script lang="ts" module>
	import type { QuizQuestion } from '$lib/curriculum';

	/** Élő dolgozat egy kérdése (a kvízkérdés alakjával egyezik). */
	export type LiveQuestion = QuizQuestion;
</script>

<script lang="ts">
	import { ArrowDown, ArrowUp, Circle, CircleCheck, CircleX, Diamond, Square, Triangle } from '@lucide/svelte';
	import { gameFor } from '$lib/question-types/components';
	import { isQuestionType, prepareQuestion } from '$lib/question-types/registry';
	import { isQuizAnswerCorrect } from '$lib/quiz-answers';
	import type { GameQuestion } from '$lib/games/types';
	import Button from '$lib/ui/Button.svelte';
	import QuestionImage from '$lib/components/quiz/QuestionImage.svelte';

	/** Kahoot-színek és formák feleletválasztóshoz. */
	const kahootTiles = [
		{ bg: '#E21B3C', Icon: Triangle },
		{ bg: '#1368CE', Icon: Diamond },
		{ bg: '#D89E00', Icon: Circle },
		{ bg: '#26890C', Icon: Square }
	];

	interface Props {
		questions: LiveQuestion[];
		stageMode: boolean;
		currentIndex?: number | null;
		locked?: boolean;
		/** Szerveres kiértékelés: true/false, hiba esetén null. */
		onAnswer: (qIdx: number, answer: string) => Promise<boolean | null> | void;
	}

	let { questions, stageMode, currentIndex = null, locked = false, onAnswer }: Props = $props();

	let internalIdx = $state(0);
	let answers = $state<Record<string, string>>({});
	/** Szerver visszaigazolása kérdésenként: a maszkolt kérdéseknél helyben nem dönthető el. */
	let serverOk = $state<Record<string, boolean | null>>({});
	let timer: ReturnType<typeof setTimeout> | undefined;

	let idx = $derived(currentIndex ?? internalIdx);
	let current = $derived(questions[Math.min(Math.max(idx, 0), Math.max(questions.length - 1, 0))]);
	let answered = $derived(current ? answers[current.id] : undefined);
	/** Visszajelzés: szerver az igazság, helyben csak akkor, ha a megoldás látszik. */
	let ok = $derived.by((): boolean | null => {
		if (!current || answered === undefined) return null;
		if (current.id in serverOk) return serverOk[current.id];
		if (current.correct_answer) return isQuizAnswerCorrect(current, answered);
		return null;
	});
	let gameQ = $derived<GameQuestion | null>(current ? prepareQuestion(current) : null);
	let knownType = $derived(current ? isQuestionType(current.type) : true);
	let stageChoice = $derived(
		stageMode && (current?.type === 'choice' || current?.type === 'tf') && (current?.options?.length ?? 0) > 0
	);

	let fallbackOrder = $state<string[]>([]);
	let fallbackText = $state('');
	let lastResetId = $state('');

	// Új kérdésnél a tartalék beviteli mezők alaphelyzetbe állnak.
	// Szándékosan csak az id-váltásra: a polling új tömbjei nem törölhetik a gépelést.
	$effect(() => {
		const c = current;
		if (c && c.id !== lastResetId) {
			lastResetId = c.id;
			fallbackText = '';
			fallbackOrder = [...(c.options ?? [])];
		}
	});

	$effect(() => {
		return () => {
			if (timer !== undefined) clearTimeout(timer);
		};
	});

	function answer(value: string) {
		if (!current || locked || answers[current.id] !== undefined) return;
		const q = current;
		const qIdx = idx;
		answers[q.id] = value;
		if (timer !== undefined) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = undefined;
			void (async () => {
				let graded: boolean | null = null;
				try {
					const res = await withTimeout(Promise.resolve(onAnswer(qIdx, value)), 4000);
					graded = typeof res === 'boolean' ? res : null;
				} catch {
					graded = null;
				}
				if (graded === null && q.correct_answer) graded = isQuizAnswerCorrect(q, value);
				serverOk[q.id] = graded;
				if (currentIndex === null || currentIndex === undefined) {
					internalIdx = Math.min(qIdx + 1, Math.max(questions.length - 1, 0));
				}
			})();
		}, 900);
	}

	function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
		return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
	}

	function moveFallback(from: number, delta: number) {
		const to = from + delta;
		if (to < 0 || to >= fallbackOrder.length) return;
		const next = [...fallbackOrder];
		[next[from], next[to]] = [next[to], next[from]];
		fallbackOrder = next;
	}

	const feedbackCls = (good: boolean) =>
		[
			'anim-pop mt-3 flex items-start gap-1.5 rounded-xl px-3 py-2.5 text-[14px] font-bold',
			good
				? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300'
				: 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200'
		].join(' ');
</script>

{#if questions.length === 0}
	<p class="py-4 text-center text-sm font-medium text-stone-500 dark:text-stone-400">Nincs kérdés.</p>
{:else if current && gameQ}
	<div class="mx-auto flex w-full max-w-[550px] flex-col">
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
					style="width: {(idx + 1) / questions.length * 100}%"
				></div>
			</div>
			<p class="shrink-0 text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
				{idx + 1}/{questions.length}
			</p>
		</div>

		<div class="pt-4">
			{#key current.id}
				{#if stageMode}
					<p class="text-center text-[18px] leading-snug font-extrabold text-balance text-ink-900 sm:text-[20px] dark:text-white">
						Figyeld a táblát
					</p>
				{:else}
					<p class="text-[18px] leading-snug font-extrabold text-balance text-ink-900 sm:text-[20px] dark:text-white">
						{current.question_text}
					</p>
					{#if current.imageUrl}
						<div class="mt-3"><QuestionImage src={current.imageUrl} /></div>
					{/if}
				{/if}
				<div class={['mt-3', locked && 'pointer-events-none opacity-60']}>
					{#if stageChoice}
						<ul class="grid gap-2 sm:grid-cols-2">
							{#each current.options as option, i (option)}
								{@const tile = kahootTiles[i % kahootTiles.length]}
								{@const picked = answered === option}
								<li>
									<button
										type="button"
										disabled={answered !== undefined}
										onclick={() => answer(option)}
										style="background:{tile.bg}"
										class={[
											'flex min-h-[76px] w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-white shadow-lg transition active:scale-[0.98] motion-reduce:transition-none',
											answered !== undefined && !picked ? 'opacity-40 saturate-50' : '',
											picked ? 'ring-4 ring-white/70 ring-offset-2 ring-offset-transparent' : ''
										]}
									>
										<tile.Icon size={28} fill="currentColor" class="shrink-0" aria-hidden="true" />
										<span class="min-w-0 flex-1 text-[16px] leading-snug font-extrabold break-words">
											{option}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					{:else if knownType}
						{@const Game = gameFor(current.type)}
						<Game
							q={gameQ}
							onAnswer={answer}
							picked={answered ?? null}
							correct={null}
						/>
					{:else if current.type === 'order' && current.options.length > 0}
						<ol class="grid gap-2">
							{#each fallbackOrder as option, i (option + ':' + i)}
								<li class="flex items-center gap-2 rounded-xl border-2 border-stone-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-transparent">
									<span class="min-w-0 flex-1 truncate text-[15px] font-medium text-ink-900 dark:text-white">{option}</span>
									<button type="button" aria-label="Feljebb: {option}" disabled={answered !== undefined} onclick={() => moveFallback(i, -1)} class="grid size-8 place-items-center rounded-full text-stone-400 transition hover:bg-stone-100 active:scale-95 disabled:opacity-40 dark:hover:bg-white/10">
										<ArrowUp size={16} />
									</button>
									<button type="button" aria-label="Lejjebb: {option}" disabled={answered !== undefined} onclick={() => moveFallback(i, 1)} class="grid size-8 place-items-center rounded-full text-stone-400 transition hover:bg-stone-100 active:scale-95 disabled:opacity-40 dark:hover:bg-white/10">
										<ArrowDown size={16} />
									</button>
								</li>
							{/each}
						</ol>
						{#if answered === undefined}
							<div class="mt-2"><Button block onclick={() => answer(JSON.stringify(fallbackOrder))}>Ellenőrzés</Button></div>
						{/if}
					{:else if current.options.length > 0}
						<div class="grid gap-2">
							{#each current.options as option (option)}
								<button
									type="button"
									disabled={answered !== undefined}
									onclick={() => answer(option)}
									class="flex items-center gap-3 rounded-xl border-2 border-stone-200 bg-white px-4 py-3 text-left text-[15px] font-medium text-ink-900 transition hover:border-brand-500 disabled:opacity-70 dark:border-white/10 dark:bg-transparent dark:text-white"
								>
									{option}
								</button>
							{/each}
						</div>
					{:else}
						<div class="grid gap-2">
							<input
								type="text"
								bind:value={fallbackText}
								disabled={answered !== undefined}
								placeholder="Válasz…"
								aria-label="Válasz"
								class="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500"
							/>
							<Button block disabled={fallbackText.trim() === '' || answered !== undefined} onclick={() => answer(fallbackText.trim())}>
								Ellenőrzés
							</Button>
						</div>
					{/if}
				</div>
			{/key}

			{#if locked && answered === undefined}
				<p class="mt-3 text-center text-[13px] font-semibold text-stone-500 dark:text-stone-400">
					Zárva: várj a tanár jelzésére.
				</p>
			{/if}

			{#if answered !== undefined}
				{#if ok === true}
					<p class={feedbackCls(true)} role="status">
						<CircleCheck size={17} class="mt-0.5 shrink-0" /> Helyes!
					</p>
				{:else if ok === false}
					<p class={feedbackCls(false)} role="status">
						<CircleX size={17} class="mt-0.5 shrink-0" /> Nem talált.
					</p>
				{:else}
					<p class="anim-pop mt-3 flex items-start gap-1.5 rounded-xl bg-stone-100 px-3 py-2.5 text-[14px] font-bold text-stone-500 dark:bg-white/10 dark:text-stone-300" role="status">
						Rögzítve, várj az eredményre.
					</p>
				{/if}
			{/if}
		</div>
	</div>
{/if}

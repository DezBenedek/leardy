<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { Check, Lightbulb, RotateCcw, X } from '@lucide/svelte';
	import type { QuizQuestion } from '$lib/curriculum';
	import type { SM2Mark } from '$lib/sm2';
	import { buildWordQueue, formatInterval, gradeSM2, summarizeSM2, todayDay } from '$lib/sm2';
	import Button from '$lib/ui/Button.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';

	/* Szavak gyakorlása: Tudom vagy Nem tudom. Alapból az összes esedékes
	   és új szó jön, nyugodt, csomagonkénti sorrendben keverés nélkül.
	   A még nem esedékes szó nem kerül bele: amit tudtál, az csak
	   holnap vagy később tér vissza, de a menet végén a maradék is
	   folytatható. Direkt csomagnyitásnál semmi nem marad ki.
	   A nem tudott szó meneten belül később újra jön, legfeljebb kétszer.
	   Minden értékelés után látszik, mikor jön újra a szó. */

	interface Props {
		questions: QuizQuestion[];
		progress?: Record<string, Partial<SM2Mark> | undefined>;
		onMark?: (id: string, known: boolean) => void;
		onDone?: (score: number, total: number) => void;
		swapped?: boolean;
		/** Direkt csomagnyitás: a még nem esedékes szó is bekerül, semmi nem marad ki. */
		includeFuture?: boolean;
		recentPackIds?: string[];
		cardToPack?: Record<string, string>;
		/** Csomagsorrend az összesített gyakorláshoz, a csomagok megjelenési sorrendjében. */
		packOrder?: string[];
		/** Oldalba ágyazva: nincs teljes magasság és alsó térköz, a lap görget. */
		embedded?: boolean;
	}

	let {
		questions,
		progress = {},
		onMark,
		onDone,
		swapped = false,
		includeFuture = false,
		recentPackIds = [],
		cardToPack = {},
		packOrder = [],
		embedded = false
	}: Props = $props();

	const SWIPE_AT = 110;
	const today = todayDay();
	/* Nem tudott szó visszapörgetése: ennyi kártyával később jön újra,
	   kártyánként legfeljebb ennyiszer egy meneten belül. */
	const REPEAT_GAP = 7;
	const REPEAT_MAX = 2;
	/** Maradék-folytatás: a napi adag után a még nem esedékes szavak is jönnek. */
	let extra = $state(false);
	let repeats: Record<string, number> = {};

	let queue = $state<{ q: QuizQuestion }[]>([]);
	let idx = $state(0);
	let revealed = $state(false);
	let known = $state(0);
	let notified = $state(false);
	let lastFeedback = $state('');
	let dragging = $state(false);
	let dragX = $state(0);
	let exitDir = $state<0 | 1 | -1>(0);
	let startX = 0;
	let startY = 0;
	let vertical = false;
	let moved = false;
	let exitTimer: ReturnType<typeof setTimeout> | undefined;
	let suppressAnim = $state(false);

	let finished = $derived(queue.length > 0 && idx >= queue.length);
	let current = $derived(queue[Math.min(idx, queue.length - 1)] ?? null);
	let done = $derived(Math.min(idx, queue.length));
	let pct = $derived(queue.length > 0 ? Math.round(((done + 1) / queue.length) * 100) : 0);
	/** Még nem esedékes szavak: a napi adag után folytatható maradék. */
	let futureCount = $derived(
		questions.length > 0 ? summarizeSM2(questions, progress, today).future : 0
	);
	let showExtra = $derived(!includeFuture && !extra && futureCount > 0);

	function deal() {
		clearTimeout(exitTimer);
		const q = buildWordQueue(questions, progress, {
			today,
			recentPackIds,
			cardToPack,
			packOrder,
			includeFuture: includeFuture || extra
		});
		queue = q.map((e) => ({ q: e.item }));
		idx = 0;
		revealed = false;
		known = 0;
		notified = false;
		lastFeedback = '';
		repeats = {};
		showInstant();
	}

	/** Újrakezdés: a maradék-folytatás kikapcsol, tiszta napi sor jön. */
	function restart() {
		extra = false;
		deal();
	}

	function requeue(card: { q: QuizQuestion }) {
		const n = repeats[card.q.id] ?? 0;
		if (n >= REPEAT_MAX) return;
		repeats[card.q.id] = n + 1;
		queue.splice(Math.min(idx + REPEAT_GAP, queue.length), 0, card);
	}

	function showInstant() {
		suppressAnim = true;
		dragX = 0;
		exitDir = 0;
		dragging = false;
		if (browser) {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					suppressAnim = false;
				});
			});
		} else {
			suppressAnim = false;
		}
	}

	$effect(() => {
		void questions.length;
		untrack(() => deal());
	});

	$effect(() => {
		void swapped;
		untrack(() => {
			revealed = false;
		});
	});

	$effect(() => {
		return () => clearTimeout(exitTimer);
	});

	$effect(() => {
		if (finished && !notified && queue.length > 0) {
			notified = true;
			onDone?.(known, queue.length);
		}
	});

	function previewNext(id: string, knew: boolean): string {
		const next = gradeSM2(progress[id], knew, today);
		return formatInterval(next.intervalDays);
	}

	function grade(knew: boolean, dir: 1 | -1) {
		if (finished || exitDir !== 0 || !current) return;
		const card = current;
		clearTimeout(exitTimer);
		dragging = false;
		if (knew) known += 1;
		lastFeedback = previewNext(card.q.id, knew);
		onMark?.(card.q.id, knew);
		exitDir = dir;
		dragX = dir * 700;
		exitTimer = setTimeout(() => {
			idx += 1;
			// Nem tudott szó pár kártyával később újra jön, okos ismétlés.
			if (!knew) requeue(card);
			revealed = false;
			showInstant();
		}, 260);
	}

	function onDown(e: PointerEvent) {
		if (finished || exitDir !== 0) return;
		dragging = true;
		moved = false;
		vertical = false;
		startX = e.clientX;
		startY = e.clientY;
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			// capture nélkül is működik
		}
	}

	function onMove(e: PointerEvent) {
		if (!dragging || exitDir !== 0) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (!moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
		moved = true;
		if (!vertical && Math.abs(dy) > Math.abs(dx) * 1.4) {
			vertical = true;
			dragging = false;
			dragX = 0;
			return;
		}
		if (!vertical) dragX = dx;
	}

	function onUp() {
		if (!dragging) return;
		dragging = false;
		if (!moved) {
			revealed = !revealed;
			return;
		}
		if (vertical) {
			dragX = 0;
			return;
		}
		if (dragX > SWIPE_AT) grade(true, 1);
		else if (dragX < -SWIPE_AT) grade(false, -1);
		else dragX = 0;
	}

	$effect(() => {
		if (!browser) return;
		const onKey = (e: KeyboardEvent) => {
			if (finished || exitDir !== 0) return;
			const t = e.target as HTMLElement | null;
			if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
			if (e.key === 'ArrowRight') {
				e.preventDefault();
				grade(true, 1);
			} else if (e.key === 'ArrowLeft') {
				e.preventDefault();
				grade(false, -1);
			} else if (e.key === ' ' || e.key === 'Enter') {
				if (t && (t.tagName === 'BUTTON' || t.tagName === 'A')) return;
				e.preventDefault();
				revealed = !revealed;
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	let dragStyle = $derived(
		suppressAnim
			? `transform: none; opacity: 1; transition: none;`
			: exitDir !== 0
				? `transform: translateX(${dragX}px) rotate(${dragX / 18}deg); opacity: 0; transition: transform 0.26s ease-in, opacity 0.26s;`
				: dragging
					? `transform: translateX(${dragX}px) rotate(${dragX / 22}deg); transition: none;`
					: `transform: translateX(0px) rotate(0deg); transition: transform 0.25s cubic-bezier(0.32,0.72,0,1);`
	);

	let hintOpacity = $derived(Math.min(Math.abs(dragX) / 80, 1));
	let swipeDir = $derived(dragging && Math.abs(dragX) > 20 ? (dragX > 0 ? 'right' : 'left') : null);

	function fitSize(text: string | undefined, base: number): number {
		const len = (text ?? '').trim().length;
		if (len <= 8) return base + 14;
		if (len <= 20) return base + 10;
		if (len <= 40) return base + 6;
		if (len <= 80) return base + 2;
		if (len <= 160) return base;
		if (len <= 300) return base - 2;
		return base - 4;
	}

	let qSize = $derived(current ? fitSize(current.q.question_text, 20) : 20);
	let aSize = $derived(current ? fitSize(current.q.correct_answer, 21) : 21);
	let frontLabel = $derived(swapped ? 'Válasz' : 'Kérdés');
	let backLabel = $derived(swapped ? 'Kérdés' : 'Válasz');
	let frontText = $derived(current ? (swapped ? current.q.correct_answer : current.q.question_text) : '');
	let backText = $derived(current ? (swapped ? current.q.question_text : current.q.correct_answer) : '');
	let frontSize = $derived(swapped ? aSize : qSize);
	let backSize = $derived(swapped ? qSize : aSize);
	let flipCls = $derived(
		suppressAnim
			? 'relative h-full transition-none [transform-style:preserve-3d]'
			: 'relative h-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none [transform-style:preserve-3d]'
	);
</script>

{#if queue.length === 0}
	<EmptyState
		title="Mára végeztél"
		description="Nincs esedékes szó, a tudott szavak holnap jönnek újra."
	/>
	{#if showExtra}
		<div class="mx-auto mt-4 w-full max-w-[550px] text-center">
			<Button onclick={() => {
				extra = true;
				deal();
			}}>
				Mégis gyakorlok ({futureCount})
			</Button>
		</div>
	{/if}
{:else if finished}
	<div class={['mx-auto grid w-full max-w-[550px] place-items-center pt-4', embedded ? 'min-h-[calc(100dvh-260px)]' : 'min-h-[calc(100dvh-140px)] pb-24']}>
		<div class="w-full rounded-[20px] bg-stone-100 p-6 text-center sm:p-8 dark:bg-white/5">
			<p class="font-display text-[30px] leading-none font-extrabold text-ink-900 tabular-nums dark:text-white">
				{known}/{queue.length}
			</p>
			<p class="mt-2 text-sm font-medium text-stone-500 dark:text-stone-400">
				{#if known === queue.length}
					Mindet tudtad.
				{:else if known === 0}
					Egyet sem tudtál, holnap újra jönnek.
				{:else}
					{queue.length - known} szó holnap újra jön.
				{/if}
			</p>
			{#if lastFeedback}
				<p class="mt-1 text-[12px] font-bold text-stone-400 dark:text-stone-500">{lastFeedback}</p>
			{/if}
			<div class="mt-4 flex justify-center gap-2">
				<Button variant="outline" onclick={restart}>
					<RotateCcw size={16} /> Újra
				</Button>
				{#if showExtra}
					<Button onclick={() => {
						extra = true;
						deal();
					}}>
						Maradék is ({futureCount})
					</Button>
				{/if}
			</div>
		</div>
	</div>
{:else if current}
	<div class={['mx-auto flex w-full max-w-[550px] flex-col', embedded ? 'min-h-[calc(100dvh-260px)]' : 'min-h-[calc(100dvh-140px)]']}>
		<div class="flex items-center gap-2">
			<div
				class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10"
				role="progressbar"
				aria-valuenow={done + 1}
				aria-valuemin={0}
				aria-valuemax={queue.length}
				aria-label="Haladás"
			>
				<div
					class="h-full rounded-full bg-brand-500 transition-all duration-300 motion-reduce:transition-none"
					style="width: {pct}%"
				></div>
			</div>
			<p class="shrink-0 text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
				{done + 1}/{queue.length}
			</p>
		</div>

		<div class="grid flex-1 place-items-center pt-3">
			<div class="w-full">
				<div class="anim-pop relative h-72 sm:h-80 [perspective:1400px]">
					<div
						role="button"
						tabindex="0"
						aria-label="Kártya: {frontText}. Koppintás a fordításhoz, húzás jobbra ha tudod, balra ha nem tudod."
						onpointerdown={onDown}
						onpointermove={onMove}
						onpointerup={onUp}
						onpointercancel={onUp}
						style={dragStyle}
						class="absolute inset-0 cursor-grab touch-pan-y outline-none select-none active:cursor-grabbing"
					>
						<div class={[flipCls, revealed ? '[transform:rotateY(180deg)]' : '']}>
							<div
								class={[
									'absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden rounded-[24px] border bg-white p-6 text-center shadow-lg shadow-stone-900/5 [backface-visibility:hidden] dark:bg-stone-900 dark:shadow-black/30',
									swipeDir === 'right'
										? 'border-emerald-500 ring-4 ring-emerald-500/40 dark:border-emerald-400'
										: swipeDir === 'left'
											? 'border-red-500 ring-4 ring-red-500/40 dark:border-red-400'
											: 'border-stone-200 dark:border-white/10'
								]}
							>
								<p class="text-[11px] font-bold tracking-widest text-stone-400 uppercase dark:text-stone-500">
									{frontLabel}
								</p>
								<p
									class="line-clamp-6 leading-snug font-extrabold text-balance text-ink-900 dark:text-white"
									style="font-size: {frontSize}px"
								>
									{frontText}
								</p>
								<p class="mt-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-400 dark:text-stone-500">
									<Lightbulb size={15} aria-hidden="true" /> Koppints a felfedéshez
								</p>
								{#if swipeDir}
									<div
										aria-hidden="true"
										class={[
											'pointer-events-none absolute inset-0 flex items-center justify-center',
											swipeDir === 'right' ? 'bg-emerald-500' : 'bg-red-500'
										]}
										style="opacity: {hintOpacity}"
									>
										<span
											class="inline-flex items-center gap-2 rounded-2xl bg-white/20 px-5 py-2.5 text-[26px] font-extrabold tracking-tight text-white"
										>
											{#if swipeDir === 'right'}
												<Check size={26} strokeWidth={3.5} aria-hidden="true" /> Tudom
											{:else}
												<X size={26} strokeWidth={3.5} aria-hidden="true" /> Nem tudom
											{/if}
										</span>
									</div>
								{/if}
							</div>
							<div
								class={[
									'absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden rounded-[24px] bg-brand-600 p-6 text-center shadow-lg shadow-brand-600/25 [backface-visibility:hidden] [transform:rotateY(180deg)] dark:bg-brand-500',
									swipeDir === 'right'
										? 'ring-4 ring-emerald-300'
										: swipeDir === 'left'
											? 'ring-4 ring-red-300'
											: ''
								]}
							>
								<p class="text-[11px] font-bold tracking-widest text-white/60 uppercase">{backLabel}</p>
								<p
									class="line-clamp-6 leading-snug font-extrabold text-balance text-white"
									style="font-size: {backSize}px"
								>
									{backText}
								</p>
								{#if swipeDir}
									<div
										aria-hidden="true"
										class={[
											'pointer-events-none absolute inset-0 flex items-center justify-center',
											swipeDir === 'right' ? 'bg-emerald-500' : 'bg-red-500'
										]}
										style="opacity: {hintOpacity}"
									>
										<span
											class="inline-flex items-center gap-2 rounded-2xl bg-white/20 px-5 py-2.5 text-[26px] font-extrabold tracking-tight text-white"
										>
											{#if swipeDir === 'right'}
												<Check size={26} strokeWidth={3.5} aria-hidden="true" /> Tudom
											{:else}
												<X size={26} strokeWidth={3.5} aria-hidden="true" /> Nem tudom
											{/if}
										</span>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class={['grid grid-cols-2 gap-2 pt-3', embedded ? '' : 'pb-24']}>
			<button
				type="button"
				onclick={() => grade(false, -1)}
				class="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-[16px] font-extrabold text-white transition hover:bg-red-600 active:scale-[0.98]"
				aria-label="Nem tudom"
			>
				<X size={20} strokeWidth={3} aria-hidden="true" /> Nem tudom
			</button>
			<button
				type="button"
				onclick={() => grade(true, 1)}
				class="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-[16px] font-extrabold text-white transition hover:bg-emerald-600 active:scale-[0.98]"
				aria-label="Tudom"
			>
				<Check size={20} strokeWidth={3} aria-hidden="true" /> Tudom
			</button>
		</div>
	</div>
{/if}

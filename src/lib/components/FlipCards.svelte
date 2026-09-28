<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { Lightbulb, RotateCcw, Shuffle } from '@lucide/svelte';
	import type { QuizQuestion } from '$lib/curriculum';
	import Button from '$lib/ui/Button.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';

	/* Quizlet-stílusú pakli: minden kérdés külön kártya.
	   Koppintás = fordítás, húzás jobbra = tudom, balra = még tanulom.
	   Nyilakkal is megy (←/→/szóköz). */

	interface Props {
		questions: QuizQuestion[];
		/** A pakli végén hívódik meg (tudott, összes), például progress-mentéshez. */
		onDone?: (score: number, total: number) => void;
		/** Minden lapozáskor lefut (kártya-azonosító, tudta-e), a kártyánkénti szinthez. */
		onCard?: (id: string, known: boolean) => void;
	}

	let { questions, onDone, onCard }: Props = $props();

	const SWIPE_AT = 110;

	/** Csak az egyértelmű szöveges válaszúak kártyázhatók. */
	let pool = $derived(
		questions.filter(
			(q) =>
				(q.type === 'choice' || q.type === 'text' || q.type === 'tf') &&
				q.correct_answer?.trim()
		)
	);

	let cards = $state<QuizQuestion[]>([]);
	let idx = $state(0);
	let revealed = $state(false);
	let known = $state(0);
	let notified = $state(false);

	// Húzás-állapot
	let dragging = $state(false);
	let dragX = $state(0);
	let exitDir = $state<0 | 1 | -1>(0);
	let startX = 0;
	let startY = 0;
	let vertical = false;
	let moved = false;
	let exitTimer: ReturnType<typeof setTimeout> | undefined;

	let finished = $derived(cards.length > 0 && idx >= cards.length);
	let current = $derived(cards[Math.min(idx, cards.length - 1)]);
	let done = $derived(Math.min(idx, cards.length));
	/** A csík az aktuális kártya sorszámát mutatja, mint a mellette lévő szöveg. */
	let pct = $derived(cards.length > 0 ? Math.round(((done + 1) / cards.length) * 100) : 0);
	/** Rövid szövegű paklinál keskenyebb az oszlop (450px), egyébként max 550px. */
	let compact = $derived(
		cards.length > 0 &&
			cards.every((c) => (c.question_text.length + (c.correct_answer ?? '').length) < 60)
	);

	function shuffle<T>(arr: T[]): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	function deal(reshuffle: boolean) {
		clearTimeout(exitTimer);
		cards = reshuffle ? shuffle(pool) : [...pool];
		idx = 0;
		revealed = false;
		known = 0;
		notified = false;
		dragX = 0;
		exitDir = 0;
		dragging = false;
	}

	// Új kérdéssor → új osztás. Untrack kell: a deal belső állapotokat
	// is olvas, és azok nem válthatják ki újra az effectet (fagyás).
	$effect(() => {
		void questions.length;
		untrack(() => deal(false));
	});

	$effect(() => {
		return () => clearTimeout(exitTimer);
	});

	$effect(() => {
		if (finished && !notified && cards.length > 0) {
			notified = true;
			onDone?.(known, cards.length);
		}
	});

	function grade(knew: boolean, dir: 1 | -1) {
		if (finished || exitDir !== 0) return;
		const q = current;
		clearTimeout(exitTimer);
		dragging = false;
		if (knew) known += 1;
		if (q) onCard?.(q.id, knew);
		exitDir = dir;
		// Határozott kirepülés a képernyőről, nem csak elhalványulás.
		dragX = dir * 700;
		exitTimer = setTimeout(() => {
			idx += 1;
			revealed = false;
			dragX = 0;
			exitDir = 0;
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
			// Függőleges gesztus → görgetésé a terep.
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

	// Nyilak és szóköz/Enter akkor is működnek, ha nincs fókuszban a kártya.
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
		exitDir !== 0
			? `transform: translateX(${dragX}px) rotate(${dragX / 18}deg); opacity: 0; transition: transform 0.26s ease-in, opacity 0.26s;`
			: dragging
				? `transform: translateX(${dragX}px) rotate(${dragX / 22}deg); transition: none;`
				: `transform: translateX(0px) rotate(0deg); transition: transform 0.25s cubic-bezier(0.32,0.72,0,1);`
	);

	let hintOpacity = $derived(Math.min(Math.abs(dragX) / 80, 1));
</script>

{#if cards.length === 0}
	<EmptyState
		title="Nincs szókártyázható kérdés"
		description="Ebben a csomagban nincs felfedhető válaszú kérdés."
	/>
{:else if finished}
	<div class="mx-auto grid min-h-[calc(100dvh-140px)] w-full max-w-[550px] place-items-center pt-4 pb-24">
		<div class="w-full rounded-[20px] bg-stone-100 p-6 text-center sm:p-8 dark:bg-white/5">
			<p class="font-display text-[30px] leading-none font-extrabold text-ink-900 tabular-nums dark:text-white">
				{known}/{cards.length}
			</p>
			<p class="mt-2 text-sm font-medium text-stone-500 dark:text-stone-400">
				{#if known === cards.length}
					Mindet tudtad.
				{:else if known === 0}
					Egyet sem tudtál.
				{:else}
					{cards.length - known} kártyát érdemes újra átnézned.
				{/if}
			</p>
			<div class="mt-4 flex justify-center gap-2">
				<Button variant="outline" onclick={() => deal(false)}>
					<RotateCcw size={16} /> Újra
				</Button>
				<Button variant="tint" onclick={() => deal(true)}>
					<Shuffle size={16} /> Keverve
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
				aria-valuenow={done + 1}
				aria-valuemin={0}
				aria-valuemax={cards.length}
				aria-label="Haladás"
			>
				<div
					class="h-full rounded-full bg-brand-500 transition-all duration-300 motion-reduce:transition-none"
					style="width: {pct}%"
				></div>
			</div>
			<p class="shrink-0 text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
				{done + 1}/{cards.length}
			</p>
		</div>

		<div class="grid flex-1 place-items-center pt-4 pb-24">
			<div class={['w-full', compact ? 'max-w-[450px]' : 'max-w-[550px]']}>
				<div class="anim-pop relative h-72 sm:h-80 [perspective:1400px]">
			<div
				role="button"
				tabindex="0"
				aria-label="Kártya: {current.question_text}. Koppintás a fordításhoz, húzás jobbra ha tudod, balra ha nem."
				onpointerdown={onDown}
				onpointermove={onMove}
				onpointerup={onUp}
				onpointercancel={onUp}
				style={dragStyle}
				class="absolute inset-0 cursor-grab touch-pan-y outline-none select-none active:cursor-grabbing"
			>
				<div
					class={[
						'relative h-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
						'[transform-style:preserve-3d]',
						revealed ? '[transform:rotateY(180deg)]' : ''
					]}
				>
					<div
						class="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden rounded-[24px] border border-stone-200 bg-white p-6 text-center shadow-lg shadow-stone-900/5 [backface-visibility:hidden] dark:border-white/10 dark:bg-stone-900 dark:shadow-black/30"
					>
						<span
							aria-hidden="true"
							class="pointer-events-none absolute top-1/2 -left-2 -translate-y-1/2 -rotate-90 rounded-full bg-red-500 px-3 py-1 text-[11px] font-extrabold tracking-wider text-white uppercase transition-opacity"
							style="opacity: {dragging && dragX < -20 ? hintOpacity : 0}"
						>
							Tanulom
						</span>
						<span
							aria-hidden="true"
							class="pointer-events-none absolute top-1/2 -right-2 -translate-y-1/2 rotate-90 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-extrabold tracking-wider text-white uppercase transition-opacity"
							style="opacity: {dragging && dragX > 20 ? hintOpacity : 0}"
						>
							Tudom
						</span>
						<p class="text-[11px] font-bold tracking-widest text-stone-400 uppercase dark:text-stone-500">
							Kérdés
						</p>
						<p class="line-clamp-6 text-[19px] leading-snug font-extrabold text-balance text-ink-900 sm:text-[21px] dark:text-white">
							{current.question_text}
						</p>
						<p class="mt-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-400 dark:text-stone-500">
							<Lightbulb size={15} aria-hidden="true" /> Koppints a felfedéshez
						</p>
					</div>
					<div
						class="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden rounded-[24px] bg-brand-600 p-6 text-center shadow-lg shadow-brand-600/25 [backface-visibility:hidden] [transform:rotateY(180deg)] dark:bg-brand-500"
					>
						<p class="text-[11px] font-bold tracking-widest text-white/60 uppercase">Válasz</p>
						<p class="line-clamp-6 text-[20px] leading-snug font-extrabold text-balance text-white sm:text-[22px]">
							{current.correct_answer}
						</p>
					</div>
				</div>
			</div>
		</div>

		<p class="mt-3 text-center text-[12px] font-medium text-stone-400 dark:text-stone-500">
			Húzd jobbra, ha tudod · balra, ha még tanulod
		</p>
			</div>
		</div>
	</div>
{/if}

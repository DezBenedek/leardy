<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { Check, Lightbulb, RotateCcw, Shuffle, X } from '@lucide/svelte';
	import type { QuizQuestion } from '$lib/curriculum';
	import Button from '$lib/ui/Button.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';

	/* Quizlet-stílusú pakli: minden kérdés külön kártya.
	   Koppintás = fordítás, húzás jobbra = Tudom, balra = Nem tudom.
	   Nyilakkal is megy (←/→/szóköz). */

	interface Props {
		questions: QuizQuestion[];
		/** A pakli végén hívódik meg (tudott, összes), például progress-mentéshez. */
		onDone?: (score: number, total: number) => void;
		/** Minden lapozáskor lefut (kártya-azonosító, tudta-e), a kártyánkénti szinthez. */
		onCard?: (id: string, known: boolean) => void;
		/** Megfordított pakli: elöl a válasz, hátul a kérdés. */
		swapped?: boolean;
	}

	let { questions, onDone, onCard, swapped = false }: Props = $props();

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
	/** Kártyaváltás pillanatában igaz: az új lap átmenet nélkül jelenik meg,
	   nem csúszik vissza és nem fordul meg zavaróan. */
	let suppressAnim = $state(false);

	let finished = $derived(cards.length > 0 && idx >= cards.length);
	let current = $derived(cards[Math.min(idx, cards.length - 1)]);
	let done = $derived(Math.min(idx, cards.length));
	/** A csík az aktuális kártya sorszámát mutatja, mint a mellette lévő szöveg. */
	let pct = $derived(cards.length > 0 ? Math.round((done / cards.length) * 100) : 0);
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

	/** Új lap azonnali megjelenítése átmenet nélkül. */
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

	function deal(reshuffle: boolean) {
		clearTimeout(exitTimer);
		cards = reshuffle ? shuffle(pool) : [...pool];
		idx = 0;
		revealed = false;
		known = 0;
		notified = false;
		showInstant();
	}

	// Új kérdéssor → új osztás. Untrack kell: a deal belső állapotokat
	// is olvas, és azok nem válthatják ki újra az effectet (fagyás).
	$effect(() => {
		void questions.length;
		untrack(() => deal(false));
	});

	// Csere kapcsolásakor mindig az új előlap látszódjon.
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
		if (finished && !notified && cards.length > 0) {
			notified = true;
			onDone?.(known, cards.length);
		}
	});

	function grade(knew: boolean, dir: 1 | -1) {
		if (finished || exitDir !== 0 || !current) return;
		if (!revealed) {
			revealed = true;
			return;
		}
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
			// A következő lap már ne az előző helyéről csússzon vissza,
			// és ne játssza vissza a fordítást: azonnal, átmenet nélkül áll be.
			showInstant();
		}, 260);
	}

	function onDown(e: PointerEvent) {
		if (finished || exitDir !== 0 || !e.isPrimary || e.button !== 0) return;
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
			if (finished || exitDir !== 0 || e.repeat) return;
			const t = e.target as HTMLElement | null;
			if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
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
	/** Húzás iránya: jobbra = Tudom (zöld), balra = Nem tudom (piros). */
	let swipeDir = $derived(dragging && Math.abs(dragX) > 20 ? (dragX > 0 ? 'right' : 'left') : null);

	/** A rövid szöveg nagyobb, a hosszú kisebb betűméretet kap és görgethető. */
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

	let qSize = $derived(current ? fitSize(current.question_text, 20) : 20);
	let aSize = $derived(current ? fitSize(current.correct_answer, 21) : 21);
	/** Megfordított pakli: elöl a válasz, hátul a kérdés. */
	let frontLabel = $derived(swapped ? 'Válasz' : 'Kérdés');
	let backLabel = $derived(swapped ? 'Kérdés' : 'Válasz');
	let frontText = $derived(current ? (swapped ? current.correct_answer : current.question_text) : '');
	let backText = $derived(current ? (swapped ? current.question_text : current.correct_answer) : '');
	let frontSize = $derived(swapped ? aSize : qSize);
	let backSize = $derived(swapped ? qSize : aSize);
	let flipCls = $derived(
		suppressAnim
			? 'relative h-full transition-none [transform-style:preserve-3d]'
			: 'relative h-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none [transform-style:preserve-3d]'
	);
</script>

{#if cards.length === 0}
	<EmptyState
		title="Nincs gyakorolható kártya"
		description="Ebben a csomagban nincs felfedhető válaszú kérdés."
	/>
{:else if finished}
	<div class="mx-auto w-full max-w-[550px] py-6">
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
				aria-valuenow={done}
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

		<div class="grid flex-1 place-items-center pt-4">
			<div class={['w-full', compact ? 'max-w-[450px]' : 'max-w-[550px]']}>
				<div class="anim-pop relative h-72 sm:h-80 [perspective:1400px]">
			<div
				role="button"
				tabindex="0"
				aria-label="Kártya: {revealed ? backText : frontText}. Koppintás a fordításhoz, felfedés után húzás jobbra ha tudod, balra ha nem tudod."
				onpointerdown={onDown}
				onpointermove={onMove}
				onpointerup={onUp}
				onpointercancel={() => { dragging = false; dragX = 0; }}
				style={dragStyle}
				class="absolute inset-0 cursor-grab touch-pan-y rounded-[24px] outline-none select-none focus-visible:ring-4 focus-visible:ring-brand-400 active:cursor-grabbing"
			>
				<div
					class={[
						flipCls,
						revealed ? '[transform:rotateY(180deg)]' : ''
					]}
				>
					<div
						aria-hidden={revealed}
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
							class="max-h-full overflow-y-auto leading-snug font-extrabold text-balance text-ink-900 dark:text-white"
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
						aria-hidden={!revealed}
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
							class="max-h-full overflow-y-auto leading-snug font-extrabold text-balance text-white"
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

		<div class="mt-4 grid gap-2 pb-6">
			{#if !revealed}
				<Button block size="lg" onclick={() => (revealed = true)}>Válasz felfedése</Button>
			{:else}
				<div class="grid grid-cols-2 gap-2">
					<Button variant="danger" disabled={exitDir !== 0} onclick={() => grade(false, -1)}>
						<X size={18} /> Nem tudom
					</Button>
					<Button disabled={exitDir !== 0} onclick={() => grade(true, 1)}>
						<Check size={18} /> Tudom
					</Button>
				</div>
			{/if}
		</div>
			</div>
		</div>
	</div>
{/if}

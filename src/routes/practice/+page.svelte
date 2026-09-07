<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Check, ListMusic, PartyPopper, RotateCcw, SkipForward, X, Zap } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card } from '$lib/components/ui/card/index.js';
	import { Dialog } from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { Alert, AlertTitle } from '$lib/components/ui/alert/index.js';
	import { Empty } from '$lib/components/ui/empty/index.js';
	import { levelKeyFor, gradeFromChoice, gradeFromTyped, fuzzyMatch, xpForGrade, type Grade } from '$lib/srs.js';
	import { store, type Card as CardType } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';

	type Mode = 'flip' | 'type' | 'choice' | 'quiz';

	const deckFilter = $derived(page.url.searchParams.get('deck'));
	const flashMode = $derived(page.url.searchParams.get('mode') === 'flash');
	const modParam = $derived(page.url.searchParams.get('mod'));
	const baseMode: Mode = $derived(
		modParam === 'type' || modParam === 'choice' || modParam === 'quiz' ? modParam : 'flip'
	);

	let queue = $state<CardType[]>([]);
	let modes = $state<Mode[]>([]);
	let started = $state(false);
	let idx = $state(0);
	let revealed = $state(false);
	let finished = $state(false);
	let loading = $state(true);
	let correct = $state(0);
	let wrong = $state(0);
	let wrongCards = $state<CardType[]>([]);
	let choices = $state<string[]>([]);
	let picked = $state<string | null>(null);
	let typed = $state('');
	let typedOk = $state(false);
	let feedback = $state<{ correct: boolean; text: string } | null>(null);
	let howOpen = $state(false);
	let shownAt = 0;
	let sessionStarted = 0;
	let sessionXp = $state(0);
	let elapsedMs = $state(0);
	let bootKey = $state('');
	let pendingTimers: ReturnType<typeof setTimeout>[] = [];

	// ---- Húzható kártya állapota (shadcn Card-ra építve) ----
	let swipeEl = $state<HTMLDivElement | null>(null);
	let drag = $state(0);
	let dragging = $state(false);
	let flying = $state<0 | 1 | -1>(0);
	let startX = 0;
	let startY = 0;
	let moved = 0;
	let lastX = 0;
	let lastT = 0;
	let velocity = 0;
	let downT = 0;

	onDestroy(() => {
		for (const id of pendingTimers) clearTimeout(id);
		pendingTimers = [];
	});

	function later(ms: number, fn: () => void) {
		const id = setTimeout(() => {
			pendingTimers = pendingTimers.filter((x) => x !== id);
			fn();
		}, ms);
		pendingTimers.push(id);
	}

	function clearPending() {
		for (const id of pendingTimers) clearTimeout(id);
		pendingTimers = [];
	}

	const deckExists = $derived(!deckFilter || store.data.decks.some((d) => d.id === deckFilter));
	const total = $derived(queue.length);
	const current = $derived(queue[idx] ?? null);

	// Kártyaváltáskor a húzás-állapot alaphelyzetbe.
	$effect(() => {
		current?.id;
		drag = 0;
		dragging = false;
		flying = 0;
		velocity = 0;
	});

	function effectiveMode(at: number): Mode {
		if (baseMode !== 'quiz') return baseMode;
		return modes[at] ?? 'flip';
	}

	function shuffle<T>(arr: T[]): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	function boot() {
		clearPending();
		const now = Date.now();
		let pool: CardType[];
		if (deckFilter) {
			pool = store.data.cards.filter((c) => c.deckId === deckFilter);
		} else if (flashMode) {
			pool = [...store.data.cards].sort((a, b) => {
				const sa = store.data.srs[a.id];
				const sb = store.data.srs[b.id];
				return (sb?.lapses ?? 0) - (sa?.lapses ?? 0) || (sa?.reps ?? 0) - (sb?.reps ?? 0);
			});
			pool = pool.slice(0, 10);
		} else {
			pool = store.dueCards(undefined, now, 20);
		}
		pool = shuffle(pool).slice(0, 20);
		const rotation: Mode[] = ['flip', 'type', 'choice'];
		modes = shuffle(pool.map((_, i) => rotation[i % rotation.length]));
		queue = pool;
		idx = 0;
		correct = 0;
		wrong = 0;
		sessionXp = 0;
		wrongCards = [];
		revealed = false;
		typedOk = false;
		typed = '';
		picked = null;
		feedback = null;
		finished = false;
		started = pool.length > 0;
		loading = false;
		shownAt = Date.now();
		sessionStarted = Date.now();
		prepareChoices();
	}

	// újraindítás ha a mód/szűrő változik
	$effect(() => {
		const key = `${deckFilter ?? ''}|${flashMode}|${baseMode}`;
		if (key !== bootKey) {
			bootKey = key;
			boot();
		}
	});

	function prepareChoices() {
		const card = queue[idx] ?? null;
		if (!card || effectiveMode(idx) !== 'choice') {
			choices = [];
			return;
		}
		// Először a soron belüli kártyákból, kevés kártyánál a teljes gyűjteményből.
		const inQueue = shuffle(queue.filter((c) => c.id !== card.id).map((c) => c.back));
		const extras =
			inQueue.length >= 3
				? inQueue
				: [
						...inQueue,
						...shuffle(
							store.data.cards.filter((c) => c.id !== card.id && !inQueue.includes(c.back)).map((c) => c.back)
						)
					];
		const others = [...new Set(extras.filter((b) => b !== card.back))].slice(0, 3);
		choices = shuffle([card.back, ...others]);
		picked = null;
	}

	function record(card: CardType, grade: Grade, wasCorrect: boolean) {
		sessionXp += xpForGrade(grade);
		store.gradeCard(card.id, grade);
		if (wasCorrect) correct += 1;
		else {
			wrong += 1;
			wrongCards = [...wrongCards, card];
		}
		if (idx + 1 >= queue.length) {
			const ms = Date.now() - sessionStarted;
			elapsedMs = ms;
			finished = true;
			store.saveResult({
				scope: 'practice',
				refId: deckFilter ?? 'all',
				refName: deckFilter
					? (store.data.decks.find((d) => d.id === deckFilter)?.name ?? '')
					: t('practice.title'),
				memberId: 'm-you',
				memberName: store.data.profile.name || t('common.you'),
				score: correct,
				total: queue.length,
				xp: sessionXp,
				at: Date.now(),
				ms
			});
		} else {
			idx += 1;
			revealed = false;
			typedOk = false;
			typed = '';
			picked = null;
			feedback = null;
			shownAt = Date.now();
			prepareChoices();
		}
	}

	function swipeKnow() {
		const card = current;
		if (!card || finished) return;
		record(card, 2, true);
	}

	function swipeDontKnow() {
		const card = current;
		if (!card || finished) return;
		record(card, 0, false);
	}

	function gradeFlip(g: Grade) {
		const card = current;
		if (!card || finished) return;
		record(card, g, g > 0);
	}

	function submitTyped() {
		const card = current;
		if (!card || revealed || !typed.trim()) return;
		const elapsed = Date.now() - shownAt;
		const ok = fuzzyMatch(typed, card.back);
		revealed = true;
		typedOk = ok;
		feedback = { correct: ok, text: ok ? t('common.correct') : `${t('practice.correctIs')} ${card.back}` };
		later(1200, () => {
			record(card, gradeFromTyped(ok, elapsed), ok);
		});
	}

	function submitChoice(choice: string) {
		const card = current;
		if (!card || picked !== null) return;
		const elapsed = Date.now() - shownAt;
		picked = choice;
		const ok = choice === card.back;
		feedback = { correct: ok, text: ok ? t('common.correct') : `${t('practice.correctIs')} ${card.back}` };
		later(1000, () => {
			record(card, gradeFromChoice(ok, elapsed), ok);
		});
	}

	function retry(list: CardType[]) {
		clearPending();
		const fresh = shuffle([...list]);
		const rotation: Mode[] = ['flip', 'type', 'choice'];
		modes = shuffle(fresh.map((_, i) => rotation[i % rotation.length]));
		queue = fresh;
		idx = 0;
		correct = 0;
		wrong = 0;
		sessionXp = 0;
		wrongCards = [];
		revealed = false;
		typedOk = false;
		typed = '';
		picked = null;
		feedback = null;
		finished = false;
		started = true;
		shownAt = Date.now();
		sessionStarted = Date.now();
		prepareChoices();
	}

	function setMode(m: Mode) {
		howOpen = false;
		const params = new URLSearchParams();
		if (deckFilter) params.set('deck', deckFilter);
		if (flashMode) params.set('mode', 'flash');
		params.set('mod', m);
		goto(`/practice?${params.toString()}`);
	}

	// ---- Húzás-kezelők ----
	function swipeWidth(): number {
		return swipeEl?.offsetWidth ?? 320;
	}

	function onPointerDown(e: PointerEvent, canSwipe: boolean) {
		if (flying !== 0 || !canSwipe) return;
		startX = e.clientX;
		startY = e.clientY;
		lastX = e.clientX;
		lastT = performance.now();
		downT = lastT;
		moved = 0;
		velocity = 0;
		dragging = true;
		swipeEl?.setPointerCapture?.(e.pointerId);
	}

	function onPointerMove(e: PointerEvent, canSwipe: boolean) {
		if (!dragging || flying !== 0) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
		const now = performance.now();
		if (now > lastT) {
			velocity = (e.clientX - lastX) / ((now - lastT) / 1000);
			lastX = e.clientX;
			lastT = now;
		}
		if (canSwipe) drag = dx;
	}

	function onPointerUp(canFlip: boolean, canSwipe: boolean, onKnow: (() => void) | null, onDont: (() => void) | null) {
		if (!dragging || flying !== 0) return;
		dragging = false;
		const w = swipeWidth();
		const threshold = w * 0.2;
		const goRight = onKnow !== null && (drag > threshold || (velocity > 850 && drag > 20));
		const goLeft = onDont !== null && (drag < -threshold || (velocity < -850 && drag < -20));

		if (canSwipe && (goRight || goLeft)) {
			flying = goRight ? 1 : -1;
			drag = flying * (w + 120);
			later(300, () => {
				if (goRight) onKnow?.();
				else onDont?.();
			});
			return;
		}
		if (moved < 10 && performance.now() - downT < 500 && canFlip) {
			revealed = !revealed;
		}
		drag = 0;
	}

	const swipeProgress = $derived(Math.min(1, Math.max(-1, drag / 90)));
	const swipeOverlay = $derived(swipeProgress > 0 ? 'var(--forest)' : 'var(--wine)');

	const nextDeck = $derived.by(() => {
		const rest = store
			.dueDeckIds()
			.filter((r) => r.id !== deckFilter)
			.map((r) => ({ ...r, name: store.data.decks.find((d) => d.id === r.id)?.name ?? '' }))
			.filter((r) => r.name);
		return rest[0] ?? null;
	});

	const levelLabel = $derived.by(() => {
		if (!current) return '';
		const key = levelKeyFor(current.level);
		return t(`practice.level.${key}` as 'practice.level.zero');
	});

	const modeRows: { m: Mode; title: string; desc: string }[] = $derived([
		{ m: 'flip', title: t('practice.mode.flip'), desc: t('practice.mode.flip.d') },
		{ m: 'type', title: t('practice.mode.type'), desc: t('practice.mode.type.d') },
		{ m: 'choice', title: t('practice.mode.choice'), desc: t('practice.mode.choice.d') },
		{ m: 'quiz', title: t('practice.mode.quiz'), desc: t('practice.mode.quiz.d') }
	]);

	const pct = $derived(total === 0 ? 0 : Math.round((correct / total) * 100));
	const timeLabel = $derived.by(() => {
		const s = Math.round(elapsedMs / 1000);
		const m = Math.floor(s / 60);
		return m > 0 ? `${m}p ${s % 60}mp` : `${s}mp`;
	});
</script>

<svelte:head>
	<title>{t('practice.title')} — Leardy</title>
</svelte:head>

{#if loading}
	<p class="text-muted-foreground py-10 text-center text-sm">…</p>
{:else if !started || queue.length === 0}
	<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
		<div>
			<h1 class="text-[26px] font-bold tracking-tight">{deckFilter ? t('practice.deckSession') : t('practice.title')}</h1>
			<p class="text-muted-foreground mt-1 text-sm">{t('practice.sub')}</p>
		</div>
		<Empty icon={PartyPopper} title={deckExists ? t('practice.empty.t') : t('decks.title')} description={deckExists ? t('practice.empty.d') : ''} />
		<div class="flex flex-col gap-2">
			<Button variant="outline" class="w-full" href="/practice?mode=flash"><Zap class="size-4" /> {t('practice.flash')}</Button>
			<Button variant="ghost" class="w-full" href="/decks">{t('common.back')}</Button>
		</div>
	</div>
{:else if finished}
	<!-- Eredményképernyő -->
	<div class="mx-auto flex min-h-[70dvh] w-full max-w-2xl flex-col items-center justify-center gap-2 px-6 text-center">
		<p class="text-muted-foreground text-sm font-semibold">{t('common.score')}</p>
		<p class="text-[40px] leading-none font-extrabold tracking-tight tabular-nums">{correct}/{total}</p>
		<p class="text-muted-foreground text-base tabular-nums">{pct}% · {timeLabel} · <span class="text-xp font-bold">+{sessionXp} XP</span></p>
		<div class="mt-5 flex w-full max-w-sm flex-col gap-2">
			{#if nextDeck}
				<Button size="xl" href="/practice?deck={nextDeck.id}&mod={baseMode}" class="w-full">
					<SkipForward class="size-5" /> {t('practice.nextPack')}: {nextDeck.name} ({nextDeck.due})
				</Button>
			{/if}
			<Button size="xl" variant="secondary" class="w-full" onclick={() => retry(queue)}>
				<RotateCcw class="size-5" /> {t('practice.retryPractice')}
			</Button>
			{#if wrongCards.length > 0}
				<Button size="xl" variant="secondary" class="w-full" onclick={() => retry(wrongCards)}>
					<RotateCcw class="size-5" /> {t('practice.retryWrong')} ({wrongCards.length})
				</Button>
			{/if}
			<Button size="xl" variant="outline" class="w-full" href={deckFilter ? `/decks/${deckFilter}` : '/decks'}>
				{t('common.back')}
			</Button>
		</div>
	</div>
{:else if current}
	{@const mode = effectiveMode(idx)}
	{@const flipMode = mode === 'flip'}
	{@const canSwipe = flipMode && !finished}
	<div class="mx-auto flex min-h-[calc(100dvh-220px)] w-full max-w-xl flex-col md:min-h-0">
		<!-- Session-fejléc -->
		<Progress value={idx + 1} max={total} class="h-[3px]" />
		<div class="flex items-center gap-1 py-1">
			<Button variant="ghost" size="icon" onclick={() => goto(deckFilter ? `/decks/${deckFilter}` : '/')} aria-label={t('common.back')}>
				<ArrowLeft class="size-5" />
			</Button>
			<span class="flex-1"></span>
			<Button variant="ghost" size="icon" onclick={() => (howOpen = true)} aria-label={t('practice.how')}>
				<ListMusic class="size-5" />
			</Button>
		</div>

		<div class="flex flex-1 flex-col justify-center gap-2 px-4 pt-1 pb-4">
			<div
				bind:this={swipeEl}
				role="button"
				tabindex={0}
				aria-label="{idx + 1} / {total}: {revealed ? current.back : current.front}"
				onpointerdown={(e) => onPointerDown(e, canSwipe)}
				onpointermove={(e) => onPointerMove(e, canSwipe)}
				onpointerup={() => onPointerUp(flipMode, canSwipe, swipeKnow, swipeDontKnow)}
				onpointercancel={() => {
					dragging = false;
					drag = 0;
				}}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						if (flipMode) revealed = !revealed;
					}
					if (e.key === 'ArrowRight' && canSwipe) swipeKnow();
					if (e.key === 'ArrowLeft' && canSwipe) swipeDontKnow();
				}}
				class="zso-touch w-full cursor-grab outline-none active:cursor-grabbing"
				style="transform: translateX({drag}px) rotate({drag * 0.04}deg); {dragging
					? ''
					: flying !== 0
						? 'transition: transform 0.3s cubic-bezier(0.3, 0.7, 0.4, 1);'
						: 'transition: transform 0.5s cubic-bezier(0.3, 1.35, 0.4, 1);'}"
			>
				<div class="relative">
					<div class="flip-inner h-72 sm:h-80" class:flipped={revealed}>
						<div class="flip-face">
							<Card class="flex h-full flex-col px-6 py-5">
								<p class="text-muted-foreground text-xs font-semibold tracking-wide tabular-nums">{idx + 1} / {total}</p>
								<div class="flex flex-1 items-center justify-center overflow-hidden">
									<p class="font-display text-center text-[28px] leading-[1.2] font-bold tracking-tight text-balance">{current.front}</p>
								</div>
								<p class="text-muted-foreground min-h-4 text-center text-xs font-medium">{flipMode ? t('common.tapToFlip') : ''}</p>
							</Card>
						</div>
						<div class="flip-face flip-back">
							<Card class="flex h-full flex-col px-6 py-5">
								<p class="text-muted-foreground text-xs font-semibold tracking-wide tabular-nums">{idx + 1} / {total}</p>
								<div class="flex flex-1 items-center justify-center overflow-hidden">
									<p class="font-display text-center text-[28px] leading-[1.2] font-bold tracking-tight text-balance">{current.back}</p>
								</div>
								<p class="text-muted-foreground min-h-4 text-center text-xs font-medium">{flipMode ? t('decks.back') : ''}</p>
							</Card>
						</div>
					</div>
					{#if Math.abs(swipeProgress) > 0.12}
						<div
							class="pointer-events-none absolute inset-0 rounded-[18px]"
							style="background: color-mix(in srgb, {swipeOverlay} {Math.round(Math.abs(swipeProgress) * 22)}%, transparent)"
						></div>
					{/if}
				</div>
			</div>

			<div class="flex h-5 items-center justify-center gap-2">
				<Progress value={current.level} max={4} class="h-1.5 w-16" />
				<span class="text-muted-foreground text-xs font-medium">{levelLabel}</span>
			</div>

			{#if flipMode}
				<div class="flex items-center justify-between px-1">
					<span class="text-sm font-semibold" style="color: var(--wine)">{t('practice.swipeDont')}</span>
					<span class="text-sm font-semibold" style="color: var(--forest)">{t('practice.swipeKnow')}</span>
				</div>
				<div class="grid grid-cols-4 gap-2">
					{#each [0, 1, 2, 3] as g (g)}
						<Button
							variant="outline"
							onclick={() => gradeFlip(g as Grade)}
							class="py-2.5 text-[13px] {g === 0
								? 'text-wine hover:text-wine'
								: g === 3
									? 'text-forest hover:text-forest'
									: ''}"
						>
							{t(`practice.g.${g}` as 'practice.g.0')}
						</Button>
					{/each}
				</div>
			{/if}

			<div class="flex h-6 items-center justify-center">
				{#if current.hint && current.hint.trim()}
					<p class="text-center text-[15px]">{t('practice.tip')}: {current.hint}</p>
				{:else}
					<p class="text-center text-[15px] opacity-50">{t('practice.noTip')}</p>
				{/if}
			</div>

			{#if mode === 'type'}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						submitTyped();
					}}
					class="flex flex-col gap-3"
				>
					<Input
						bind:value={typed}
						disabled={revealed}
						placeholder={t('practice.otherSide')}
						autocomplete="off"
						enterkeyhint="done"
					/>
					<Button type="submit" size="xl" class="w-full" disabled={revealed || !typed.trim()}>
						<Check class="size-5" /> {t('common.check')}
					</Button>
				</form>
				<div class="flex min-h-[60px] items-center justify-center">
					{#if feedback}
						<Alert variant={feedback.correct ? 'success' : 'destructive'} class="w-auto">
							{#if feedback.correct}<Check />{:else}<X />{/if}
							<AlertTitle>{feedback.text}</AlertTitle>
						</Alert>
					{/if}
				</div>
			{:else if mode === 'choice'}
				<div class="flex flex-col gap-2">
					{#each choices as choice (choice)}
						{@const answered = picked !== null}
						{@const isRight = answered && choice === current.back}
						{@const isWrongPick = answered && choice === picked && choice !== current.back}
						<Button
							variant="outline"
							disabled={answered}
							onclick={() => submitChoice(choice)}
							class="min-h-[52px] h-auto px-4 py-3 text-[15px] whitespace-normal {isRight
								? 'border-forest border-2 text-forest hover:text-forest'
								: isWrongPick
									? 'border-wine border-2 text-wine hover:text-wine'
									: ''}"
							style={isRight
								? 'background: color-mix(in srgb, var(--forest) 12%, transparent)'
								: isWrongPick
									? 'background: color-mix(in srgb, var(--wine) 12%, transparent)'
									: undefined}
						>
							{choice}
						</Button>
					{/each}
				</div>
				<div class="flex min-h-[60px] items-center justify-center">
					{#if feedback}
						<Alert variant={feedback.correct ? 'success' : 'destructive'} class="w-auto">
							{#if feedback.correct}<Check />{:else}<X />{/if}
							<AlertTitle>{feedback.text}</AlertTitle>
						</Alert>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Módválasztó -->
<Dialog bind:open={howOpen} title={t('practice.how')}>
	<div class="flex flex-col gap-2">
		{#each modeRows as row (row.m)}
			<button
				type="button"
				onclick={() => setMode(row.m)}
				class="press flex items-center gap-3 rounded-[14px] border bg-card p-3.5 text-left"
			>
				<span class="min-w-0 flex-1">
					<span class="block text-[15px] font-semibold">{row.title}</span>
					<span class="text-muted-foreground block text-[13px]">{row.desc}</span>
				</span>
				{#if row.m === baseMode}<Check class="text-primary size-5 shrink-0" />{/if}
			</button>
		{/each}
	</div>
</Dialog>

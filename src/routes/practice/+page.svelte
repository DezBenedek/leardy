<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Check, ListMusic, PartyPopper, RotateCcw, SkipForward, Zap } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card } from '$lib/components/ui/card/index.js';
	import { Dialog } from '$lib/components/ui/dialog/index.js';
	import EmptyState from '$lib/components/empty-state.svelte';
	import FeedbackPill from '$lib/components/feedback-pill.svelte';
	import KnowledgeSignal from '$lib/components/knowledge-signal.svelte';
	import ZsoKartya from '$lib/components/zso-kartya.svelte';
	import { levelKeyFor, gradeFromChoice, gradeFromTyped, type Grade } from '$lib/srs.js';
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
	let elapsedMs = $state(0);
	let bootKey = $state('');

	const total = $derived(queue.length);
	const current = $derived(queue[idx] ?? null);

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
		} else {
			pool = store.dueCards(undefined, now, 20);
		}
		if (flashMode && !deckFilter) pool = pool.slice(0, Math.min(10, Math.max(pool.length, 5)));
		pool = shuffle(pool).slice(0, 20);
		const rotation: Mode[] = ['flip', 'type', 'choice'];
		modes = shuffle(pool.map((_, i) => rotation[i % rotation.length]));
		queue = pool;
		idx = 0;
		correct = 0;
		wrong = 0;
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
		const others = shuffle(queue.filter((c) => c.id !== card.id).map((c) => c.back)).slice(0, 3);
		choices = shuffle([card.back, ...others]);
		picked = null;
	}

	function record(card: CardType, grade: Grade, wasCorrect: boolean) {
		const elapsed = Date.now() - shownAt;
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
				xp: 0,
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

	function submitTyped() {
		const card = current;
		if (!card || revealed || !typed.trim()) return;
		const elapsed = Date.now() - shownAt;
		const ok = card.back.toLowerCase().trim() === typed.toLowerCase().trim() || fuzzy(card);
		revealed = true;
		typedOk = ok;
		feedback = { correct: ok, text: ok ? t('common.correct') : `${t('practice.correctIs')} ${card.back}` };
		setTimeout(() => {
			record(card, gradeFromTyped(ok, elapsed), ok);
		}, 1200);
	}

	function fuzzy(card: CardType): boolean {
		const a = typed.toLowerCase().trim().replace(/\s+/g, ' ');
		const b = card.back.toLowerCase().trim().replace(/\s+/g, ' ');
		if (a === b) return true;
		if (!a) return false;
		let dist: number;
		{
			const m = a.length;
			const n = b.length;
			const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
			for (let i = 1; i <= m; i++) {
				let prev = dp[0];
				dp[0] = i;
				for (let j = 1; j <= n; j++) {
					const tmp = dp[j];
					dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
					prev = tmp;
				}
			}
			dist = dp[n];
		}
		return dist <= (b.length <= 4 ? 1 : 2);
	}

	function submitChoice(choice: string) {
		const card = current;
		if (!card || picked !== null) return;
		const elapsed = Date.now() - shownAt;
		picked = choice;
		const ok = choice === card.back;
		feedback = { correct: ok, text: ok ? t('common.correct') : `${t('practice.correctIs')} ${card.back}` };
		setTimeout(() => {
			record(card, gradeFromChoice(ok, elapsed), ok);
		}, 1000);
	}

	function retry(list: CardType[]) {
		queue = shuffle([...list]);
		const rotation: Mode[] = ['flip', 'type', 'choice'];
		modes = shuffle(queue.map((_, i) => rotation[i % rotation.length]));
		idx = 0;
		correct = 0;
		wrong = 0;
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

	const modeRows: { m: Mode; title: string; desc: string }[] = [
		{ m: 'flip', title: t('practice.mode.flip'), desc: t('practice.mode.flip.d') },
		{ m: 'type', title: t('practice.mode.type'), desc: t('practice.mode.type.d') },
		{ m: 'choice', title: t('practice.mode.choice'), desc: t('practice.mode.choice.d') },
		{ m: 'quiz', title: t('practice.mode.quiz'), desc: t('practice.mode.quiz.d') }
	];

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
		<EmptyState icon={PartyPopper} title={t('practice.empty.t')} desc={t('practice.empty.d')}>
			<Button variant="outline" size="sm" href="/practice?mode=flash"><Zap class="size-4" /> {t('practice.flash')}</Button>
		</EmptyState>
	</div>
{:else if finished}
	<!-- Eredményképernyő -->
	<div class="mx-auto flex min-h-[70dvh] w-full max-w-2xl flex-col items-center justify-center gap-2 px-6 text-center">
		<p class="text-muted-foreground text-sm font-semibold">{t('common.score')}</p>
		<p class="text-[40px] leading-none font-extrabold tracking-tight">{correct}/{total}</p>
		<p class="text-muted-foreground text-base">{pct}% · {timeLabel}</p>
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
	<div class="mx-auto flex min-h-[calc(100dvh-220px)] w-full max-w-xl flex-col md:min-h-0">
		<!-- SessionScaffold fejléc -->
		<div class="h-[3px] w-full overflow-hidden rounded-full bg-secondary">
			<div class="bg-primary h-full rounded-full transition-all" style="width: {((idx + 1) / total) * 100}%"></div>
		</div>
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
			{#key `${current.id}-${mode}`}
				<ZsoKartya
					front={current.front}
					back={current.back}
					stamp="{idx + 1} / {total}"
					frontHint={flipMode ? t('common.tapToFlip') : null}
					backHint={flipMode ? t('decks.back') : null}
					canFlip={flipMode}
					bind:showBack={revealed}
					onKnow={flipMode ? swipeKnow : null}
					onDontKnow={flipMode ? swipeDontKnow : null}
				/>
			{/key}

			<div class="flex h-5 items-center justify-center gap-1.5">
				<KnowledgeSignal level={current.level} height={12} />
				<span class="text-muted-foreground text-xs font-medium">{levelLabel}</span>
			</div>

			{#if flipMode}
				<div class="flex items-center justify-between px-1">
					<span class="text-sm font-semibold" style="color: var(--wine)">{t('practice.swipeDont')}</span>
					<span class="text-sm font-semibold" style="color: var(--forest)">{t('practice.swipeKnow')}</span>
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
					<input
						class="field"
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
				<div class="flex h-[60px] items-center justify-center">
					{#if feedback}<FeedbackPill correct={feedback.correct} text={feedback.text} />{/if}
				</div>
			{:else if mode === 'choice'}
				<div class="flex flex-col gap-2">
					{#each choices as choice (choice)}
						{@const answered = picked !== null}
						{@const isRight = answered && choice === current.back}
						{@const isWrongPick = answered && choice === picked && choice !== current.back}
						<button
							type="button"
							disabled={answered}
							onclick={() => submitChoice(choice)}
							class="press flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] border bg-card px-4 text-center text-[15px] font-semibold"
							style={isRight
								? 'border-color: var(--forest); border-width: 2px; color: var(--forest)'
								: isWrongPick
									? 'border-color: var(--wine); border-width: 2px; color: var(--wine)'
									: undefined}
						>
							{choice}
						</button>
					{/each}
				</div>
				<div class="flex h-[60px] items-center justify-center">
					{#if feedback}<FeedbackPill correct={feedback.correct} text={feedback.text} />{/if}
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

<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ArrowLeft, PartyPopper, RotateCcw, Star, Zap } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { store, type Card as CardType } from '$lib/db.svelte.js';
	import type { Grade } from '$lib/srs.js';
	import { t } from '$lib/i18n.js';
	import { cn } from '$lib/utils.js';

	const deckFilter = $derived(page.url.searchParams.get('deck'));
	const flashMode = $derived(page.url.searchParams.get('mode') === 'flash');

	interface Item {
		card: CardType;
	}
	let queue = $state<Item[]>([]);
	let started = $state(false);
	let idx = $state(0);
	let flipped = $state(false);
	let graded = $state(0);
	let earned = $state(0);
	let finished = $state(false);

	const total = $derived(queue.length);
	const current = $derived(queue[idx]?.card ?? null);

	function start() {
		const now = Date.now();
		let pool: CardType[];
		if (deckFilter) {
			pool = store.data.cards.filter((c) => c.deckId === deckFilter);
		} else if (flashMode) {
			// villám: a leggyengébbek — sok lapse / kevés ismétlés előre
			pool = [...store.data.cards].sort((a, b) => {
				const sa = store.data.srs[a.id];
				const sb = store.data.srs[b.id];
				return (sb?.lapses ?? 0) - (sa?.lapses ?? 0) || (sa?.reps ?? 0) - (sb?.reps ?? 0);
			});
		} else {
			pool = store.dueCards(undefined, now, 20);
		}
		if (flashMode && !deckFilter) pool = pool.slice(0, Math.min(10, Math.max(pool.length, 5)));
		// keverés
		for (let i = pool.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[pool[i], pool[j]] = [pool[j], pool[i]];
		}
		queue = pool.slice(0, 20).map((card) => ({ card }));
		idx = 0;
		graded = 0;
		earned = 0;
		flipped = false;
		finished = false;
		started = true;
	}

	function grade(g: Grade) {
		if (!current || finished) return;
		earned += store.gradeCard(current.id, g);
		graded += 1;
		flipped = false;
		if (idx + 1 >= queue.length) {
			finished = true;
			store.saveResult({
				scope: 'practice',
				refId: deckFilter ?? 'all',
				refName: deckFilter
					? (store.data.decks.find((d) => d.id === deckFilter)?.name ?? '')
					: t('practice.title'),
				memberId: 'm-you',
				memberName: store.data.profile.name || t('common.you'),
				score: graded,
				total: queue.length,
				xp: earned,
				at: Date.now()
			});
		} else {
			idx += 1;
		}
	}

	const grades: { g: Grade; label: string; cls: string }[] = [
		{ g: 0, label: t('practice.g.0'), cls: 'bg-rose-500/12 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20' },
		{ g: 1, label: t('practice.g.1'), cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25' },
		{ g: 2, label: t('practice.g.2'), cls: 'bg-primary/12 text-primary hover:bg-primary/20' },
		{ g: 3, label: t('practice.g.3'), cls: 'bg-sky-500/12 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20' }
	];

	// ha van esedékes, azonnal indítható állapot
	const dueCount = $derived(deckFilter ? store.data.cards.filter((c) => c.deckId === deckFilter).length : store.dueCards(undefined, Date.now(), 500).length);
</script>

<svelte:head>
	<title>{t('practice.title')} — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	{#if !started}
		<div>
			<h1 class="font-display text-2xl font-extrabold tracking-tight">{deckFilter ? t('practice.deckSession') : t('practice.title')}</h1>
			<p class="text-muted-foreground mt-1 text-sm">{t('practice.sub')}</p>
		</div>

		{#if dueCount === 0}
			<EmptyState icon={PartyPopper} title={t('practice.empty.t')} desc={t('practice.empty.d')}>
				<Button variant="outline" size="sm" href="/practice?mode=flash"><Zap class="size-4" /> {t('practice.flash')}</Button>
			</EmptyState>
		{:else}
			<Card class="py-6">
				<CardContent class="flex flex-col items-center gap-3 text-center">
					<span class="bg-primary/10 grid size-14 place-items-center rounded-3xl">
						<Zap class="text-primary size-7" fill="currentColor" />
					</span>
					<p class="text-lg font-bold">{dueCount} {t('common.cards')}</p>
					<p class="text-muted-foreground -mt-2 text-sm">{t('practice.sub')}</p>
					<Button size="lg" onclick={start} class="mt-1"><Zap class="size-4" fill="currentColor" /> {t('common.start')}</Button>
				</CardContent>
			</Card>
		{/if}
	{:else if finished}
		<Card class="py-8">
			<CardContent class="flex flex-col items-center gap-2 text-center">
				<span class="anim-pop-in bg-primary/10 grid size-16 place-items-center rounded-3xl">
					<PartyPopper class="text-primary size-8" />
				</span>
				<h1 class="font-display text-2xl font-extrabold">{t('practice.done.t')}</h1>
				<p class="text-muted-foreground text-sm">{graded} {t('practice.done.d')}</p>
				<p class="text-xp inline-flex items-center gap-1 text-lg font-extrabold">
					<Star class="size-5" fill="currentColor" /> +{earned} XP
				</p>
				<div class="mt-3 flex gap-2">
					<Button variant="outline" onclick={() => goto('/')}><ArrowLeft class="size-4" /> {t('common.back')}</Button>
					<Button onclick={start}><RotateCcw class="size-4" /> {t('practice.again')}</Button>
				</div>
			</CardContent>
		</Card>
	{:else if current}
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="icon" onclick={() => (started = false)} aria-label={t('common.back')}>
				<ArrowLeft class="size-5" />
			</Button>
			<Progress value={idx} max={total} class="flex-1" />
			<span class="text-muted-foreground text-xs font-bold whitespace-nowrap">{idx + 1}{t('common.of')}{total}</span>
		</div>

		<!-- Kártya -->
		<button
			type="button"
			onclick={() => (flipped = !flipped)}
			class="perspective-1200 press block h-72 w-full cursor-pointer text-left sm:h-80"
			aria-label={t('common.tapToFlip')}
		>
			<div class="flip-inner" class:flipped>
				<div class="flip-face">
					<Card class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
						<p class="text-muted-foreground text-xs font-bold tracking-widest uppercase">{current.front.length > 0 ? 'EN' : ''}</p>
						<p class="font-display text-3xl font-extrabold text-balance sm:text-4xl">{current.front}</p>
						{#if current.example}
							<p class="text-muted-foreground mt-2 max-w-md text-sm italic">“{current.example}”</p>
						{/if}
						<p class="text-muted-foreground mt-4 text-xs font-semibold">{t('common.tapToFlip')}</p>
					</Card>
				</div>
				<div class="flip-face flip-back">
					<Card class="border-primary/30 flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-primary/[0.08] to-transparent p-6 text-center">
						<p class="text-muted-foreground text-xs font-bold tracking-widest uppercase">HU</p>
						<p class="font-display text-3xl font-extrabold text-balance sm:text-4xl">{current.back}</p>
						{#if current.exampleHu}
							<p class="text-muted-foreground mt-2 max-w-md text-sm italic">“{current.exampleHu}”</p>
						{/if}
					</Card>
				</div>
			</div>
		</button>

		{#if !flipped}
			<Button variant="secondary" size="lg" class="w-full" onclick={() => (flipped = true)}>
				{t('common.showAnswer')}
			</Button>
		{:else}
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
				{#each grades as { g, label, cls } (g)}
					<button
						type="button"
						onclick={() => grade(g)}
						class={cn('press rounded-2xl px-2 py-3.5 text-[13px] font-bold transition-colors', cls)}
					>
						{label}
					</button>
				{/each}
			</div>
		{/if}
	{/if}
</div>

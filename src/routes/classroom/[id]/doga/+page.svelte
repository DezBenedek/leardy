<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Check, Crown, Play, Timer, Trophy, UserPlus, X } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { store, type Card as CardType, type Member } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';
	import { cn } from '$lib/utils.js';

	const groupId = $derived(page.params.id ?? '');
	const group = $derived(store.data.groups.find((g) => g.id === groupId));
	const deckId = $derived(page.url.searchParams.get('deck') ?? '');
	const deck = $derived(store.data.decks.find((d) => d.id === deckId));
	const qCount = $derived(Math.max(3, Math.min(15, Number(page.url.searchParams.get('n')) || 10)));
	const secs = $derived(Math.max(5, Math.min(60, Number(page.url.searchParams.get('s')) || 20)));

	interface Q {
		card: CardType;
		options: string[];
		answer: number;
	}

	type Phase = 'lobby' | 'run' | 'reveal' | 'done';

	let phase = $state<Phase>('lobby');
	let present = $state<Member[]>([]);
	let questions = $state<Q[]>([]);
	let qIdx = $state(0);
	let picked = $state<number | null>(null);
	let mine = $state(0);
	let board = $state<Record<string, number>>({});
	let timeLeft = $state(0);
	let timeouts: ReturnType<typeof setTimeout>[] = [];
	let interval: ReturnType<typeof setInterval> | null = null;

	const mates = $derived((group?.members ?? []).filter((m) => !m.you));
	const q = $derived(questions[qIdx] ?? null);
	const me = $derived(group?.members.find((m) => m.you));

	onDestroy(cleanup);

	function cleanup() {
		for (const id of timeouts) clearTimeout(id);
		timeouts = [];
		if (interval) clearInterval(interval);
		interval = null;
	}

	function later(ms: number, fn: () => void) {
		timeouts.push(setTimeout(fn, ms));
	}

	// ---- lobby: csapattársak "csatlakoznak" ----
	$effect(() => {
		if (phase === 'lobby' && group) {
			present = [];
			mates.forEach((m, i) => {
				later(700 + i * 900 + Math.random() * 600, () => {
					present = [...present, m];
				});
			});
		}
	});

	function shuffle<T>(arr: T[]): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	function buildQs(): Q[] {
		const deckCards = store.data.cards.filter((c) => c.deckId === deckId);
		const pool = deckCards.length >= 4 ? deckCards : store.data.cards;
		const pickedCards = shuffle(deckCards.length > 0 ? deckCards : pool).slice(0, qCount);
		return pickedCards.map((card) => {
			const others = shuffle(pool.filter((c) => c.id !== card.id)).slice(0, 3);
			const options = shuffle([card.front, ...others.map((c) => c.front)]);
			return { card, options, answer: options.indexOf(card.front) };
		});
	}

	function start() {
		questions = buildQs();
		if (questions.length === 0) return;
		qIdx = 0;
		mine = 0;
		board = {};
		for (const m of mates) board[m.id] = 0;
		runRound();
	}

	function mateSkill(m: Member): number {
		// erősebb csapattárs (több XP) nagyobb eséllyel talál el
		return Math.min(0.92, 0.45 + m.xp / 800);
	}

	function runRound() {
		phase = 'run';
		picked = null;
		timeLeft = secs;
		const current = questions[qIdx];
		// csapattársak válaszai
		for (const m of mates) {
			const delay = 1500 + Math.random() * Math.max(500, (secs - 2) * 1000);
			later(delay, () => {
				if (phase !== 'run') return;
				if (Math.random() < mateSkill(m)) {
					board = { ...board, [m.id]: (board[m.id] ?? 0) + 10 };
				}
			});
		}
		if (interval) clearInterval(interval);
		interval = setInterval(() => {
			timeLeft = Math.max(0, timeLeft - 0.25);
			if (timeLeft <= 0) {
				if (interval) clearInterval(interval);
				reveal();
			}
		}, 250);
	}

	function pick(i: number) {
		if (phase !== 'run' || picked !== null) return;
		picked = i;
		if (questions[qIdx].answer === i) mine += 1;
	}

	function reveal() {
		phase = 'reveal';
		later(1800, () => {
			if (qIdx + 1 >= questions.length) finish();
			else {
				qIdx += 1;
				runRound();
			}
		});
	}

	function finish() {
		phase = 'done';
		const total = questions.length;
		const xp = mine * 10;
		store.addXp(xp, 0);
		if (group && deck) {
			store.saveResult({
				scope: 'doga',
				refId: deck.id,
				refName: deck.name,
				memberId: 'm-you',
				memberName: me?.name || store.data.profile.name || t('common.you'),
				score: mine,
				total,
				xp,
				at: Date.now()
			});
		}
	}

	const standings = $derived.by(() => {
		const rows = mates.map((m) => ({ id: m.id, name: m.name || '?', score: board[m.id] ?? 0, you: false }));
		rows.push({ id: 'm-you', name: me?.name || store.data.profile.name || t('common.you'), score: mine * 10, you: true });
		return rows.sort((a, b) => b.score - a.score);
	});

	const deckReady = $derived((store.data.cards.filter((c) => c.deckId === deckId).length ?? 0) > 0);
</script>

<svelte:head>
	<title>{t('class.startDoga')} — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	{#if !group || !deck}
		<p class="text-muted-foreground text-sm">…</p>
	{:else if phase === 'lobby'}
		<div class="text-center">
			<Badge class="mb-2 font-mono text-sm">{group.code}</Badge>
			<h1 class="font-display text-2xl font-extrabold">{t('class.lobby.t')}</h1>
			<p class="text-muted-foreground mt-1 text-sm">{deck.name} · {qCount} {t('common.question')} · {secs} {t('class.sec')}</p>
			<p class="text-muted-foreground mt-1 text-xs">{t('class.lobby.d')}</p>
		</div>
		<Card class="py-3">
			<CardContent class="flex flex-col gap-1 px-3">
				<div class="flex items-center gap-3 rounded-xl bg-primary/8 px-3 py-2.5">
					<span class="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-full text-sm font-extrabold">
						{(me?.name || '?').charAt(0).toUpperCase()}
					</span>
					<span class="flex-1 text-sm font-bold">{me?.name || store.data.profile.name || t('common.you')}</span>
					<Crown class="size-4 text-amber-500" />
				</div>
				{#each present as m (m.id)}
					<div class="anim-pop-in flex items-center gap-3 rounded-xl px-3 py-2.5">
						<span class="bg-muted grid size-9 shrink-0 place-items-center rounded-full text-sm font-extrabold">
							{(m.name || '?').charAt(0).toUpperCase()}
						</span>
						<span class="flex-1 text-sm font-semibold">{m.name}</span>
					</div>
				{/each}
				{#if present.length < mates.length}
					<p class="text-muted-foreground flex items-center gap-1.5 px-3 py-2 text-xs font-semibold">
						<UserPlus class="size-3.5 animate-pulse" /> …
					</p>
				{/if}
			</CardContent>
		</Card>
		<Button size="lg" class="w-full" disabled={!deckReady} onclick={start}>
			<Play class="size-4" fill="currentColor" /> {t('class.lobbyStart')} ({1 + present.length})
		</Button>
		<Button variant="ghost" href="/classroom/{group.id}">{t('common.back')}</Button>
	{:else if (phase === 'run' || phase === 'reveal') && q}
		<div class="flex items-center gap-3">
			<span class="text-muted-foreground text-xs font-bold whitespace-nowrap">{qIdx + 1}{t('common.of')}{questions.length}</span>
			<Progress value={qIdx + (phase === 'reveal' ? 1 : 0)} max={questions.length} class="flex-1" />
			<span class={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums', timeLeft <= 5 ? 'bg-rose-500/15 text-rose-500' : 'bg-muted text-muted-foreground')}>
				<Timer class="size-3.5" /> {Math.ceil(timeLeft)}
			</span>
		</div>
		<div class="h-1.5 overflow-hidden rounded-full bg-muted">
			<div
				class={cn('h-full rounded-full transition-[width] duration-200', timeLeft <= 5 ? 'bg-rose-500' : 'bg-primary')}
				style="width: {(timeLeft / secs) * 100}%"
			></div>
		</div>

		<Card class="py-6">
			<div class="flex flex-col items-center gap-1 px-5 text-center">
				<p class="text-muted-foreground text-xs font-bold tracking-widest uppercase">{t('learn.choiceHint')}</p>
				<p class="font-display text-3xl font-extrabold">{q.card.back}</p>
			</div>
		</Card>
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
			{#each q.options as opt, i (i)}
				{@const show = phase === 'reveal'}
				{@const isAnswer = show && i === q.answer}
				{@const isWrongPick = show && picked === i && i !== q.answer}
				<button
					type="button"
					disabled={phase !== 'run' || picked !== null}
					onclick={() => pick(i)}
					class={cn(
						'press flex items-center justify-between gap-2 rounded-2xl border px-4 py-4 text-left text-[15px] font-bold transition-colors',
						isAnswer
							? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
							: isWrongPick
								? 'border-rose-500 bg-rose-500/12 text-rose-600 dark:text-rose-400'
								: picked === i
									? 'border-primary bg-primary/10 text-primary'
									: 'bg-card hover:border-primary/50'
					)}
				>
					{opt}
					{#if isAnswer}<Check class="size-5 shrink-0" />{/if}
					{#if isWrongPick}<X class="size-5 shrink-0" />{/if}
				</button>
			{/each}
		</div>
		{#if phase === 'reveal' && picked === null}
			<p class="text-center text-sm font-bold text-rose-500">{t('class.timeUp')} {q.card.front}</p>
		{/if}

		<!-- Élő állás -->
		<Card class="py-3">
			<CardContent class="px-3">
				<p class="text-muted-foreground px-2 pb-1 text-xs font-bold tracking-wider uppercase">{t('class.board')}</p>
				{#each standings as row, i (row.id)}
					<div class="flex items-center gap-2.5 rounded-xl px-2 py-1.5 {row.you ? 'bg-primary/8' : ''}">
						<span class="w-5 text-center text-sm font-extrabold text-muted-foreground">{i + 1}</span>
						<span class="min-w-0 flex-1 truncate text-sm font-bold">{row.name}{row.you ? ` (${t('common.you')})` : ''}</span>
						<span class="text-sm font-extrabold tabular-nums">{row.score}</span>
					</div>
				{/each}
			</CardContent>
		</Card>
	{:else if phase === 'done'}
		<div class="text-center">
			<span class="anim-pop-in mx-auto grid size-16 place-items-center rounded-3xl bg-amber-500/15">
				<Trophy class="size-8 text-amber-500" />
			</span>
			<h1 class="font-display mt-3 text-2xl font-extrabold">{t('class.finish.t')}</h1>
			<p class="text-muted-foreground mt-1 text-sm font-semibold">
				{mine}{t('common.of')}{questions.length} · <span class="text-xp font-extrabold">+{mine * 10} XP</span>
			</p>
		</div>
		<Card class="py-3">
			<CardContent class="flex flex-col gap-1 px-3">
				{#each standings as row, i (row.id)}
					<div class="flex items-center gap-2.5 rounded-xl px-2 py-2 {row.you ? 'bg-primary/8' : ''}">
						<span class="w-6 text-center">{#if i === 0}<Crown class="mx-auto size-4 text-amber-500" />{:else}<span class="text-sm font-extrabold text-muted-foreground">{i + 1}</span>{/if}</span>
						<span class="min-w-0 flex-1 truncate text-sm font-bold">{row.name}{row.you ? ` (${t('common.you')})` : ''}</span>
						<span class="text-sm font-extrabold tabular-nums">{row.score}</span>
					</div>
				{/each}
			</CardContent>
		</Card>
		<div class="flex gap-2">
			<Button variant="outline" class="flex-1" href="/classroom/{group.id}">{t('common.back')}</Button>
			<Button class="flex-1" onclick={start}>{t('common.retry')}</Button>
		</div>
	{/if}
</div>

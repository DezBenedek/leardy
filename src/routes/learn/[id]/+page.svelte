<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { ArrowLeft, ArrowRight, Check, RotateCcw, Star, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card } from '$lib/components/ui/card/index.js';
	import FeedbackPill from '$lib/components/feedback-pill.svelte';
	import { lessonMeta, store, type Card as CardType } from '$lib/db.svelte.js';
	import { freshSrs, fuzzyMatch } from '$lib/srs.js';
	import { t } from '$lib/i18n.js';
	import { toasts } from '$lib/components/ui/toast/toast.svelte.js';
	import { cn } from '$lib/utils.js';

	const id = $derived(page.params.id ?? '');
	const metaIdx = $derived(lessonMeta().findIndex((m) => m.id === id));
	const meta = $derived(metaIdx >= 0 ? lessonMeta()[metaIdx] : null);
	const lang = $derived(store.data.profile.lang);
	const cards = $derived(meta ? store.lessonCards(meta.id) : []);

	type ChoiceQ = { kind: 'choice'; card: CardType; options: string[]; answer: number };
	type TypeQ = { kind: 'type'; card: CardType };
	type Q = ChoiceQ | TypeQ;

	let phase = $state<'study' | 'quiz' | 'done'>('study');
	let studyIdx = $state(0);
	let flipped = $state(false);
	let questions = $state<Q[]>([]);
	let qIdx = $state(0);
	let correct = $state(0);
	let picked = $state<number | null>(null);
	let typed = $state('');
	let typedState = $state<'idle' | 'ok' | 'bad'>('idle');
	let result = $state<{ stars: number; xp: number; pct: number } | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});

	function shuffle<T>(arr: T[]): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	function nextStudy() {
		flipped = false;
		if (studyIdx + 1 >= cards.length) startQuiz();
		else studyIdx += 1;
	}

	function buildQuestions(): Q[] {
		const order = shuffle(cards);
		const qs: Q[] = [];
		const nChoice = Math.min(5, order.length);
		for (let i = 0; i < nChoice; i++) {
			const card = order[i];
			const others = shuffle(cards.filter((c) => c.id !== card.id)).slice(0, 3);
			const options = shuffle([card.front, ...others.map((c) => c.front)]);
			qs.push({ kind: 'choice', card, options, answer: options.indexOf(card.front) });
		}
		for (let i = nChoice; i < order.length; i++) {
			qs.push({ kind: 'type', card: order[i] });
		}
		return qs;
	}

	function startQuiz() {
		// a lecke szavai bekerülnek az SRS-körforgásba
		const now = Date.now();
		for (const c of cards) {
			if (!store.data.srs[c.id]) store.data.srs[c.id] = freshSrs(c.id, now);
		}
		store.save();
		questions = buildQuestions();
		qIdx = 0;
		correct = 0;
		picked = null;
		typed = '';
		typedState = 'idle';
		phase = 'quiz';
	}

	function pick(i: number) {
		if (picked !== null) return;
		const q = questions[qIdx];
		if (q.kind !== 'choice') return;
		picked = i;
		const ok = i === q.answer;
		if (ok) correct += 1;
		store.markCard(q.card.id, ok);
		timer = setTimeout(nextQ, 950);
	}

	function checkTyped() {
		if (typedState !== 'idle') return;
		const q = questions[qIdx];
		if (q.kind !== 'type' || !typed.trim()) return;
		const ok = fuzzyMatch(typed, q.card.front);
		typedState = ok ? 'ok' : 'bad';
		if (ok) correct += 1;
		store.markCard(q.card.id, ok);
		timer = setTimeout(nextQ, ok ? 950 : 2200);
	}

	function nextQ() {
		if (qIdx + 1 >= questions.length) {
			finish();
			return;
		}
		qIdx += 1;
		picked = null;
		typed = '';
		typedState = 'idle';
	}

	function finish() {
		const total = questions.length;
		const pct = total === 0 ? 0 : Math.round((correct / total) * 100);
		const r = store.completeLesson(id, pct);
		result = { stars: r.stars, xp: r.xp, pct };
		phase = 'done';
		if (r.stars > 0 && metaIdx + 1 < lessonMeta().length) {
			toasts.show(t('learn.unlocked'));
		}
		store.saveResult({
			scope: 'lesson',
			refId: id,
			refName: meta ? (lang === 'en' ? meta.en : meta.hu) : '',
			memberId: 'm-you',
			memberName: store.data.profile.name || t('common.you'),
			score: correct,
			total,
			xp: r.xp,
			at: Date.now()
		});
	}

	function retry() {
		phase = 'study';
		studyIdx = 0;
		flipped = false;
		result = null;
	}

	const studyCard = $derived(cards[studyIdx] ?? null);
	const q = $derived(questions[qIdx] ?? null);
	const stepTotal = $derived(cards.length + questions.length);
	const stepNow = $derived(phase === 'study' ? studyIdx : cards.length + qIdx);
</script>

<svelte:head>
	<title>{meta ? (lang === 'en' ? meta.en : meta.hu) : t('learn.title')} — Leardy</title>
</svelte:head>

<div class="mx-auto flex min-h-[calc(100dvh-180px)] w-full max-w-2xl flex-col md:min-h-0">
	<!-- SessionScaffold fejléc: vékony sáv + vissza-sor -->
	<div class="h-[3px] w-full overflow-hidden rounded-full bg-secondary">
		<div class="bg-primary h-full rounded-full transition-all" style="width: {(stepNow / Math.max(1, stepTotal)) * 100}%"></div>
	</div>
	<div class="flex items-center gap-1 py-1">
		<Button variant="ghost" size="icon" href="/learn" aria-label={t('common.back')}>
			<ArrowLeft class="size-5" />
		</Button>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-bold">
				{metaIdx + 1}. {meta ? (lang === 'en' ? meta.en : meta.hu) : ''}
			</p>
		</div>
		<span class="text-muted-foreground text-xs font-bold whitespace-nowrap">
			{Math.min(stepNow + 1, stepTotal)}{t('common.of')}{stepTotal}
		</span>
	</div>

	<div class="flex flex-1 flex-col justify-center gap-3 px-1 pt-1 pb-4">

	{#if !meta}
		<p class="text-muted-foreground text-sm">…</p>
	{:else if phase === 'study' && studyCard}
		<button
			type="button"
			onclick={() => (flipped = !flipped)}
			class="perspective-1200 press zso-touch block h-80 w-full cursor-pointer text-left"
			aria-label={t('common.tapToFlip')}
		>
			<div class="flip-inner" class:flipped>
				<div class="flip-face">
					<Card class="flex h-full flex-col px-[22px] py-[18px]">
						<p class="text-muted-foreground text-xs font-semibold">{studyIdx + 1} / {cards.length}</p>
						<div class="flex flex-1 items-center justify-center overflow-hidden">
							<p class="text-center text-[28px] leading-[1.2] font-bold tracking-tight text-balance">{studyCard.front}</p>
						</div>
						<p class="text-muted-foreground min-h-4 text-center text-xs font-medium">{t('common.tapToFlip')}</p>
					</Card>
				</div>
				<div class="flip-face flip-back">
					<Card class="flex h-full flex-col px-[22px] py-[18px]">
						<p class="text-muted-foreground text-xs font-semibold">{studyIdx + 1} / {cards.length}</p>
						<div class="flex flex-1 flex-col items-center justify-center gap-2 overflow-hidden">
							<p class="text-center text-[28px] leading-[1.2] font-bold tracking-tight text-balance">{studyCard.back}</p>
							{#if studyCard.exampleHu}
								<p class="reader-body text-muted-foreground max-w-md text-center">“{studyCard.exampleHu}”</p>
							{/if}
						</div>
						<p class="min-h-4"></p>
					</Card>
				</div>
			</div>
		</button>
		{#if studyCard.example}
			<p class="reader-body text-muted-foreground px-2 text-center">“{studyCard.example}”</p>
		{/if}
		<Button size="xl" class="w-full text-base" onclick={nextStudy}>
			{studyIdx + 1 >= cards.length ? t('learn.quizPhase') : t('common.continue')}
			<ArrowRight class="size-4" />
		</Button>
	{:else if phase === 'quiz' && q}
		{#if q.kind === 'choice'}
			<Card class="py-6">
				<div class="flex flex-col items-center gap-1 px-5 text-center">
					<p class="text-muted-foreground text-xs font-bold tracking-widest uppercase">{t('learn.choiceHint')}</p>
					<p class="font-display text-3xl font-extrabold">{q.card.back}</p>
				</div>
			</Card>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
				{#each q.options as opt, i (i)}
					{@const isAnswer = picked !== null && i === q.answer}
					{@const isWrongPick = picked === i && i !== q.answer}
					<button
						type="button"
						disabled={picked !== null}
						onclick={() => pick(i)}
						class={cn(
							'press flex min-h-[52px] items-center justify-between gap-2 rounded-[14px] border bg-card px-4 text-center text-[15px] font-semibold transition-colors',
							isAnswer
								? 'border-2 text-forest'
								: isWrongPick
									? 'border-2 text-wine'
									: 'hover:border-primary/50'
						)}
						style={isAnswer
							? 'border-color: var(--forest); background: color-mix(in srgb, var(--forest) 12%, transparent)'
							: isWrongPick
								? 'border-color: var(--wine); background: color-mix(in srgb, var(--wine) 12%, transparent)'
								: undefined}
					>
						{opt}
						{#if isAnswer}<Check class="size-5 shrink-0" />{/if}
						{#if isWrongPick}<X class="size-5 shrink-0" />{/if}
					</button>
				{/each}
			</div>
			{#if picked !== null}
				<div class="flex justify-center">
					<FeedbackPill
						correct={picked === q.answer}
						text={picked === q.answer ? t('common.correct') : `${t('practice.correctIs')} ${q.card.front}`}
					/>
				</div>
			{/if}
		{:else}
			<Card class="py-6">
				<div class="flex flex-col items-center gap-1 px-5 text-center">
					<p class="text-muted-foreground text-xs font-bold tracking-widest uppercase">HU → EN</p>
					<p class="font-display text-3xl font-extrabold">{q.card.back}</p>
					{#if q.card.example}
						<p class="text-muted-foreground mt-1 max-w-md text-sm italic">“{q.card.example}”</p>
					{/if}
				</div>
			</Card>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					checkTyped();
				}}
				class="flex gap-2"
			>
				<input
					class="field flex-1"
					bind:value={typed}
					placeholder={t('learn.typePh')}
					autocomplete="off"
					disabled={typedState !== 'idle'}
				/>
				<Button type="submit" disabled={!typed.trim() || typedState !== 'idle'}>{t('common.check')}</Button>
			</form>
			{#if typedState !== 'idle'}
				<div class="flex h-[60px] items-center justify-center">
					<FeedbackPill
						correct={typedState === 'ok'}
						text={typedState === 'ok' ? t('common.correct') : `${t('practice.correctIs')} ${q.card.front}`}
					/>
				</div>
			{/if}
		{/if}
	{:else if phase === 'done' && result}
		<Card class="py-8">
			<div class="flex flex-col items-center gap-2 px-5 text-center">
				<span class="anim-pop-in grid size-16 place-items-center rounded-3xl {result.stars > 0 ? 'bg-amber-500/15' : 'bg-muted'}">
					<Star class={cn('size-8', result.stars > 0 ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
				</span>
				<h1 class="text-2xl font-extrabold tracking-tight">
					{result.stars > 0 ? t('learn.result.t') : t('learn.result.fail')}
				</h1>
				<div class="flex gap-1" aria-label="{result.stars}/3">
					{#each [1, 2, 3] as s (s)}
						<Star class={cn('size-6', s <= result.stars ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
					{/each}
				</div>
				<p class="text-muted-foreground text-sm font-semibold">
					{result.pct}% · +{result.xp} XP {t('learn.xpEarned')}
				</p>
				<div class="mt-3 flex flex-wrap justify-center gap-2">
					<Button variant="outline" onclick={retry}><RotateCcw class="size-4" /> {t('common.retry')}</Button>
					<Button href="/learn">{t('learn.backPath')}</Button>
				</div>
			</div>
		</Card>
	{/if}
	</div>
</div>

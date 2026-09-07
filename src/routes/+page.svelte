<script lang="ts">
	import { BellRing, BookOpen, ChevronRight, Flame, Play, Rows3 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { Alert, AlertTitle } from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Accordion } from '$lib/components/ui/accordion/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { last28Counts, lessonMeta, store } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';
	import { cn } from '$lib/utils.js';

	const profile = $derived(store.data.profile);
	const lang = $derived(profile.lang);
	const locale = $derived(lang === 'en' ? 'en' : 'hu');
	const today = $derived(store.todayCount());
	const goal = $derived(profile.dailyGoal);
	const goalLeft = $derived(goal - today);

	const dateLabel = $derived(
		new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date())
	);
	const firstName = $derived(profile.name.trim().split(/\s+/)[0] ?? '');

	const reminder = $derived(profile.reminder);
	const pastReminder = $derived.by(() => {
		const now = new Date();
		return now.getHours() > reminder.hour || (now.getHours() === reminder.hour && now.getMinutes() >= reminder.minute);
	});
	const showReminder = $derived(reminder.enabled && pastReminder && goalLeft > 0);

	const dueTotal = $derived.by(() => {
		const nowMs = Date.now();
		return store.data.cards.filter((c) => {
			const s = store.data.srs[c.id];
			return !s || s.due <= nowMs;
		}).length;
	});

	const dueDecks = $derived.by(() => {
		const rows = store.dueDeckIds();
		return rows
			.map((r) => {
				const deck = store.data.decks.find((d) => d.id === r.id);
				if (!deck) return null;
				const total = store.data.cards.filter((c) => c.deckId === deck.id).length;
				return { ...deck, due: r.due, total };
			})
			.filter((d) => d !== null);
	});

	const currentIdx = $derived.by(() => {
		const metas = lessonMeta();
		for (let i = 0; i < metas.length; i++) {
			if ((store.data.lessons[metas[i].id]?.stars ?? 0) < 1) return i;
		}
		return -1;
	});
	const currentMeta = $derived(currentIdx >= 0 ? lessonMeta()[currentIdx] : null);

	const heat = $derived(last28Counts(store.data.activity));
	const heatMax = $derived(Math.max(1, ...heat));
</script>

<svelte:head>
	<title>Leardy — nyelvtanulás játékosan</title>
</svelte:head>

<section class="stagger mx-auto flex w-full max-w-2xl flex-col gap-4 px-1 pt-2">
	<div>
		<p class="text-muted-foreground text-sm">{dateLabel}</p>
		<h1 class="font-display mt-0.5 text-[26px] leading-tight font-bold tracking-tight">
			{firstName ? (lang === 'en' ? `Hi, ${firstName}` : `Szia, ${firstName}`) : t('home.ready')}
		</h1>
	</div>

	{#if showReminder}
		<Alert variant="info">
			<BellRing />
			<AlertTitle>{t('home.reminderBanner')}</AlertTitle>
		</Alert>
	{/if}

	<!-- Haladás-kártya -->
	<Card class="px-[22px] py-5">
		<p class="text-base font-semibold">{t('home.today')}</p>
		<p class="mt-2 text-[38px] leading-none font-extrabold tracking-tight">
			{dueTotal === 0 ? t('home.caughtUp') : `${dueTotal} ${t('home.dueLabel')}`}
		</p>
		<p class="text-muted-foreground mt-1 text-base">
			{dueTotal === 0 ? t('home.ready') : `${today} / ${goal} ${t('home.doneToday')}`}
		</p>
		<div class="mt-4">
			{#if dueDecks.length > 0}
				<Button href="/practice?deck={dueDecks[0].id}" size="xl" class="w-full text-base">
					<Play class="size-5" fill="currentColor" /> {t('home.startPractice')}
				</Button>
			{:else}
				<Button href="/decks" size="xl" class="w-full text-base">
					<Rows3 class="size-5" /> {t('home.studyToday')}
				</Button>
			{/if}
		</div>
		<div class="mt-3.5 flex items-center justify-between gap-2">
			<span class="text-base font-semibold">{today} / {goal}</span>
			<span class={cn('text-sm', goalLeft <= 0 ? 'text-forest font-bold' : 'text-muted-foreground')}>
				{goalLeft <= 0 ? t('home.goalDone') : `${goalLeft} ${t('home.goalLeft')}`}
			</span>
		</div>
		<Progress value={today} max={goal} class="mt-2" />
		<Separator class="my-4" />
		<div class="grid grid-cols-2 gap-2.5">
			<div class="rounded-2xl bg-secondary/70 px-3.5 py-3">
				<p class="font-display text-[26px] leading-tight font-bold tabular-nums">{dueTotal}</p>
				<p class="text-muted-foreground mt-1 text-sm">{t('home.dueLabel')}</p>
			</div>
			<div class="rounded-2xl bg-secondary/70 px-3.5 py-3">
				<p class="font-display text-[26px] leading-tight font-bold tabular-nums">{today}</p>
				<p class="text-muted-foreground mt-1 text-sm">{t('home.doneToday')}</p>
			</div>
		</div>
		<div class="mt-2.5 flex items-center gap-3 rounded-2xl bg-secondary/70 px-3.5 py-3.5">
			<Badge variant="streak"><Flame class="size-3.5" fill="currentColor" /> {profile.streak}</Badge>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-bold">
					{profile.streak > 0 ? `${profile.streak} ${t('home.streakDaysSuffix')}` : t('home.streakNone')}
				</p>
				<Progress value={Math.min(profile.streak, 7)} max={7} class="mt-2 h-1.5" />
			</div>
		</div>
	</Card>

	<!-- Esedékes szettek -->
	{#if dueDecks.length > 0}
		<div class="mt-2">
			<h2 class="mb-2.5 text-base font-semibold">{t('home.dueDecks')}</h2>
			<div class="flex flex-col gap-2">
				{#each dueDecks as deck (deck.id)}
					<Card class="card-lift flex-row items-center gap-3 px-4 py-3.5">
						<a href="/decks/{deck.id}" class="press flex min-w-0 flex-1 items-center gap-3">
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-semibold">{deck.name}</span>
								<span class="text-muted-foreground mt-1 block text-[13px]">
									{deck.due} {t('home.dueLabel')} · {deck.total} {t('decks.cards.n')}
								</span>
							</span>
							<ChevronRight class="text-muted-foreground size-5 shrink-0" />
						</a>
						<a
							href="/practice?deck={deck.id}"
							aria-label="{t('home.startPractice')}: {deck.name}"
							class="press text-primary grid size-10 shrink-0 place-items-center rounded-full"
							style="background: color-mix(in srgb, var(--primary) 12%, transparent)"
						>
							<Play class="size-5" fill="currentColor" />
						</a>
					</Card>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Folytatás -->
	{#if currentMeta}
		<a href="/learn/{currentMeta.id}" class="press group mt-1 block">
			<Card class="card-lift flex-row items-center gap-3 px-4 py-3.5">
				<BookOpen class="text-primary size-5 shrink-0" />
				<span class="min-w-0 flex-1">
					<span class="block text-[15px] font-semibold">{t('home.continueLesson')}</span>
					<span class="text-muted-foreground mt-0.5 block truncate text-[13px]">
						{currentIdx + 1}. {lang === 'en' ? currentMeta.en : currentMeta.hu}
					</span>
				</span>
				<ChevronRight class="text-muted-foreground size-5 transition-transform group-hover:translate-x-0.5" />
			</Card>
		</a>
	{/if}

	<!-- 28 napos hőtérkép -->
	<Card class="px-2 py-1">
		<Accordion value="heat" title={t('home.last28')}>
			{#snippet icon()}
				<BookOpen class="text-primary size-5 shrink-0" />
			{/snippet}
			<div class="grid grid-cols-7 gap-1.5 px-2">
				{#each heat as n, i (i)}
					<span
						class="rise rise-quick aspect-square rounded-[6px]"
						style="--i: {i}; {n === 0
							? 'background: var(--secondary)'
							: `background: color-mix(in srgb, var(--primary) ${Math.round((0.22 + (n / heatMax) * 0.78) * 100)}%, transparent)`}"
						title={`${n}`}
					></span>
				{/each}
			</div>
		</Accordion>
	</Card>
</section>

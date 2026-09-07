<script lang="ts">
	import { BellRing, BookOpen, ChevronRight, Play, Rows3 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import StreakTally from '$lib/components/streak-tally.svelte';
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
	const now = new Date();
	const pastReminder = $derived(
		now.getHours() > reminder.hour || (now.getHours() === reminder.hour && now.getMinutes() >= reminder.minute)
	);
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
	const weekLabels = $derived.by(() => {
		const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
		const base = new Date();
		base.setDate(base.getDate() - 27);
		return Array.from({ length: 7 }, (_, i) => {
			const d = new Date(base);
			d.setDate(base.getDate() + i);
			return fmt.format(d);
		});
	});
	const heatMax = $derived(Math.max(1, ...heat));
</script>

<svelte:head>
	<title>Leardy — nyelvtanulás játékosan</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-1 pt-2">
	<p class="text-muted-foreground text-sm">{dateLabel}</p>
	<h1 class="-mt-3 text-[26px] leading-tight font-bold tracking-tight">
		{firstName ? (lang === 'en' ? `Hi, ${firstName}` : `Szia, ${firstName}`) : t('home.ready')}
	</h1>

	{#if showReminder}
		<Card class="py-4">
			<CardContent class="flex items-center gap-3">
				<BellRing class="text-primary size-5 shrink-0" />
				<p class="text-sm font-medium">{t('home.reminderBanner')}</p>
			</CardContent>
		</Card>
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
		<Progress value={today} max={goal} class="mt-2 h-2" />
		<div class="mt-3 grid grid-cols-2 gap-2.5">
			<Card class="bg-secondary/60 px-3.5 py-3">
				<p class="text-[26px] leading-tight font-bold">{dueTotal}</p>
				<p class="text-muted-foreground mt-1 text-sm">{t('home.dueLabel')}</p>
			</Card>
			<Card class="bg-secondary/60 px-3.5 py-3">
				<p class="text-[26px] leading-tight font-bold">{today}</p>
				<p class="text-muted-foreground mt-1 text-sm">{t('home.doneToday')}</p>
			</Card>
		</div>
		<Card class="mt-2.5 px-3.5 py-3.5">
			<StreakTally days={profile.streak} />
		</Card>
	</Card>

	<!-- Esedékes szettek -->
	{#if dueDecks.length > 0}
		<div class="mt-2">
			<h2 class="mb-2.5 text-base font-semibold">{t('home.dueDecks')}</h2>
			<div class="flex flex-col gap-2">
				{#each dueDecks as deck (deck.id)}
					<a href="/decks/{deck.id}" class="press block">
						<Card class="card-lift flex-row items-center gap-3 px-4 py-3.5">
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-semibold">{deck.name}</span>
								<span class="text-muted-foreground mt-1 block text-[13px]">
									{deck.due} {t('home.dueLabel')} · {deck.total} {t('decks.cards.n')}
								</span>
							</span>
							<span
								role="button"
								tabindex={0}
								aria-label={t('home.startPractice')}
								onclick={(e) => {
									e.preventDefault();
									window.location.href = `/practice?deck=${deck.id}`;
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										window.location.href = `/practice?deck=${deck.id}`;
									}
								}}
								class="press text-primary grid size-10 place-items-center rounded-full"
								style="background: color-mix(in srgb, var(--primary) 12%, transparent)"
							>
								<Play class="size-5" fill="currentColor" />
							</span>
							<ChevronRight class="text-graphite size-5" />
						</Card>
					</a>
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
				<ChevronRight class="text-graphite size-5 transition-transform group-hover:translate-x-0.5" />
			</Card>
		</a>
	{/if}

	<!-- 28 napos hőtérkép -->
	<details class="group">
		<Card class="px-4 py-3.5">
			<summary class="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
				<BookOpen class="text-primary size-5 shrink-0" />
				<span class="flex-1 text-[15px] font-semibold">{t('home.last28')}</span>
				<ChevronRight class="text-graphite size-5 transition-transform group-open:rotate-90" />
			</summary>
			<div class="pt-3">
				<div class="grid grid-cols-7 gap-1.5">
					{#each weekLabels as day (day)}
						<p class="text-muted-foreground text-center text-xs font-medium">{day}</p>
					{/each}
				</div>
				<div class="mt-2 grid grid-cols-7 gap-1.5">
					{#each heat as n, i (i)}
						<span
							class="aspect-square rounded-[6px]"
							title={`${n}`}
							style={n === 0
								? 'background: var(--secondary)'
								: `background: color-mix(in srgb, var(--primary) ${Math.round((0.22 + (n / heatMax) * 0.78) * 100)}%, transparent)`}
						></span>
					{/each}
				</div>
			</div>
		</Card>
	</details>
</section>

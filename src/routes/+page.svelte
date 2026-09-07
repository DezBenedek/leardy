<script lang="ts">
	import { BookOpenCheck, ChevronRight, Compass, Flame, Layers, Play, School, Star, Zap } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { lessonMeta, store } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';

	const profile = $derived(store.data.profile);
	const today = $derived(store.todayCount());
	const goal = $derived(profile.dailyGoal);
	const goalPct = $derived(Math.min(100, Math.round((today / goal) * 100)));
	const goalDone = $derived(today >= goal);

	const hour = new Date().getHours();
	const greetKey = hour < 10 ? 'home.greet.morning' : hour < 18 ? 'home.greet.day' : 'home.greet.evening';

	const displayName = $derived(profile.name || (profile.lang === 'en' ? 'learner' : 'tanuló'));

	// Aktuális lecke: az első, ami nincs kész csillaggal
	const currentIdx = $derived.by(() => {
		const metas = lessonMeta();
		for (let i = 0; i < metas.length; i++) {
			if ((store.data.lessons[metas[i].id]?.stars ?? 0) < 1) return i;
		}
		return -1;
	});
	const currentMeta = $derived(currentIdx >= 0 ? lessonMeta()[currentIdx] : null);
	const lang = $derived(profile.lang);

	const modules = $derived([
		{
			href: '/learn',
			icon: Compass,
			tint: 'bg-primary/12 text-primary',
			title: t('home.mod.learn.t'),
			desc: t('home.mod.learn.d')
		},
		{
			href: '/decks',
			icon: Layers,
			tint: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
			title: t('home.mod.decks.t'),
			desc: t('home.mod.decks.d')
		},
		{
			href: '/classroom',
			icon: School,
			tint: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
			title: t('home.mod.class.t'),
			desc: t('home.mod.class.d')
		}
	]);

	// SVG gyűrű a napi célhoz
	const R = 26;
	const CIRC = 2 * Math.PI * R;
</script>

<svelte:head>
	<title>Leardy — nyelvtanulás játékosan</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<!-- Hero: napi cél -->
	<div class="hero rounded-3xl p-5 text-white shadow-lg shadow-emerald-900/20 sm:p-6">
		<div class="flex items-center gap-4">
			<div class="relative grid size-20 shrink-0 place-items-center">
				<svg viewBox="0 0 64 64" class="absolute inset-0 size-full -rotate-90">
					<circle cx="32" cy="32" r={R} fill="none" stroke="rgb(255 255 255 / 0.25)" stroke-width="7" />
					<circle
						cx="32"
						cy="32"
						r={R}
						fill="none"
						stroke="white"
						stroke-width="7"
						stroke-linecap="round"
						stroke-dasharray={CIRC}
						stroke-dashoffset={CIRC - (CIRC * goalPct) / 100}
						class="transition-all duration-700"
					/>
				</svg>
				{#if goalDone}
					<BookOpenCheck class="anim-pop-in size-7" />
				{:else}
					<span class="text-lg font-extrabold">{today}/{goal}</span>
				{/if}
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-[13px] font-semibold tracking-wide text-white/75">
					{t(greetKey)}{#if profile.name}, {profile.name}{:else} — {displayName}{/if}!
				</p>
				<h1 class="font-display text-[22px] leading-tight font-extrabold sm:text-2xl">
					{goalDone ? t('home.goalDone') : `${today} ${t('home.goalLeft')}`}
				</h1>
				<div class="mt-1.5 flex items-center gap-3 text-[13px] font-bold">
					<span class="inline-flex items-center gap-1">
						<Flame class="size-4" fill="currentColor" /> {profile.streak}
					</span>
					<span class="inline-flex items-center gap-1">
						<Star class="size-4" fill="currentColor" /> {profile.xp} XP
					</span>
				</div>
			</div>
		</div>
		<div class="mt-4">
			<Button
				href="/practice"
				size="lg"
				class="w-full bg-white font-extrabold text-emerald-700 shadow-md hover:bg-emerald-50 sm:w-auto dark:bg-emerald-950 dark:text-emerald-100 dark:hover:bg-emerald-900"
			>
				<Play class="size-4" fill="currentColor" /> {t('home.startPractice')}
			</Button>
		</div>
	</div>

	<!-- Folytatás -->
	{#if currentMeta}
		<a href="/learn" class="group press block">
			<Card class="card-lift flex-row items-center gap-4 border-primary/25 bg-gradient-to-r from-primary/[0.07] to-transparent py-4">
				<span class="bg-primary text-primary-foreground anim-floaty grid size-12 shrink-0 place-items-center rounded-2xl shadow-md shadow-emerald-500/30">
					<Play class="size-5" fill="currentColor" />
				</span>
				<div class="min-w-0 flex-1">
					<p class="text-muted-foreground text-xs font-bold tracking-wider uppercase">{t('home.currentLesson')}</p>
					<p class="truncate text-[15px] font-bold">
						{currentIdx + 1}. {lang === 'en' ? currentMeta.en : currentMeta.hu}
					</p>
				</div>
				<Badge variant="secondary">{t('common.continue')}</Badge>
				<ChevronRight class="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
			</Card>
		</a>
	{:else}
		<Card class="flex-row items-center gap-4 py-4">
			<span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
				<BookOpenCheck class="size-6" />
			</span>
			<p class="text-sm font-semibold">{t('home.allDone')}</p>
		</Card>
	{/if}

	<!-- Modulok -->
	<div class="grid gap-3 sm:grid-cols-3">
		{#each modules as m (m.href)}
			{@const Icon = m.icon}
			<a href={m.href} class="group press">
				<Card class="card-lift h-full">
					<CardContent class="flex flex-col gap-3 pt-1">
						<span class="grid size-11 place-items-center rounded-2xl {m.tint}">
							<Icon class="size-5" strokeWidth={2.2} />
						</span>
						<div>
							<h2 class="flex items-center gap-1 text-[15px] font-bold">
								{m.title}
								<ChevronRight class="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
							</h2>
							<p class="text-muted-foreground mt-1 text-[13px] leading-snug">{m.desc}</p>
						</div>
					</CardContent>
				</Card>
			</a>
		{/each}
	</div>

	<a href="/practice?mode=flash" class="group press">
		<Card class="card-lift flex-row items-center gap-3 py-4">
			<span class="bg-xp/15 text-xp grid size-11 shrink-0 place-items-center rounded-2xl">
				<Zap class="size-5" fill="currentColor" />
			</span>
			<div class="min-w-0 flex-1">
				<p class="text-[15px] font-bold">{t('home.flash.t')}</p>
				<p class="text-muted-foreground text-[13px]">{t('home.flash.d')}</p>
			</div>
			<ChevronRight class="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
		</Card>
	</a>

	<!-- Mai haladás sáv -->
	<Card class="py-4">
		<CardContent class="flex items-center gap-3">
			<Badge variant="secondary">{t('home.goalTitle')}</Badge>
			<Progress value={today} max={goal} class="flex-1" />
			<span class="text-muted-foreground text-xs font-bold whitespace-nowrap">{today}{t('common.of')}{goal}</span>
		</CardContent>
	</Card>
</section>

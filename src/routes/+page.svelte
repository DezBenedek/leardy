<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, BookOpen, CalendarDays, Check, ChevronRight, ClipboardCheck, Flame, Languages, Minus, Settings } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { auth } from '$lib/auth.svelte';
	import { Query } from '$lib/query.svelte';
	import { learningDay, relativeDeadline } from '$lib/learning-activity';
	import type { HomeStats, Suggestion } from '$lib/curriculum';
	import TaskDetailDrawer, { type TaskDetail } from '$lib/components/TaskDetailDrawer.svelte';
	import AssignmentDetailDrawer, { type AssignmentDetail } from '$lib/components/AssignmentDetailDrawer.svelte';
	import Card from '$lib/ui/Card.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let homeQ = new Query<HomeStats & { suggestions: Suggestion[] }>();

	interface LangDue {
		subjectId: string;
		subjectTitle: string;
		due: number;
		fresh: number;
		total: number;
		packs: number;
		linkId: string;
	}

	type DueQuiz = TaskDetail & { kind: 'quiz' };
	type DueAssignment = AssignmentDetail & { dueDate: number; kind: 'assignment' };
	type DueItem = DueQuiz | DueAssignment;
	type GradingItem = AssignmentDetail & { kind: 'assignment'; pendingCount: number };

	let wordsQ = new Query<{ languages: LangDue[] }>();
	let tasksQ = new Query<{ tasks: DueItem[]; grading: GradingItem[] }>();
	let words = $derived([...(wordsQ.data?.languages ?? [])].sort((a, b) => b.due - a.due || b.fresh - a.fresh));
	let grading = $derived(tasksQ.data?.grading ?? []);
	let pendingCount = $derived(grading.reduce((count, item) => count + item.pendingCount, 0));
	let dueTasks = $derived([...(tasksQ.data?.tasks ?? [])].sort((a, b) => a.dueDate - b.dueDate));
	let wordsLoading = $derived(wordsQ.data == null && !wordsQ.error);
	let tasksLoading = $derived(tasksQ.data == null && !tasksQ.error);
	let homeLoading = $derived(homeQ.data == null && !homeQ.error);
	let heroLoading = $derived(wordsLoading || tasksLoading || homeLoading);
	let stats = $derived(homeQ.data);

	let openQuiz = $state<DueQuiz | null>(null);
	let openAssignment = $state<AssignmentDetail | null>(null);
	let now = $state(Date.now());
	let user = $derived(auth.ready ? auth.user : (data.user ?? null));
	let firstName = $derived(user?.name.trim().split(/\s+/)[0] ?? '');
	const dayLabels = ['H', 'K', 'Sz', 'Cs', 'P', 'Sz', 'V'];
	const fullDayFormat = new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', month: 'long', day: 'numeric', weekday: 'long' });
	const dueFormat = new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	const dateFormat = new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', month: 'long', day: 'numeric', weekday: 'long' });
	let currentDay = learningDay();

	const HOME_TTL = 5 * 60_000;
	const HOME_STALE = 15 * 60_000;
	homeQ.prime('home', HOME_STALE);
	function loadHome() {
		homeQ.load('home', async () => {
			const res = await fetch('/api/home');
			if (!res.ok) throw new Error('Nem sikerült betölteni az aktivitást.');
			return res.json();
		}, HOME_TTL, HOME_STALE);
	}
	loadHome();

	tasksQ.prime('home-tasks', HOME_STALE);
	function loadTasks() {
		tasksQ.load('home-tasks', async () => {
			const res = await fetch('/api/home/tasks');
			if (!res.ok) throw new Error('Nem sikerült betölteni a feladatokat.');
			return res.json();
		}, HOME_TTL, HOME_STALE);
	}
	loadTasks();

	wordsQ.prime('sm2-due', HOME_STALE);
	function loadWords() {
		wordsQ.load('sm2-due', async () => {
			const res = await fetch('/api/sm2-due');
			if (!res.ok) throw new Error('Nem sikerült betölteni a szavakat.');
			return res.json();
		}, HOME_TTL, HOME_STALE);
	}
	loadWords();

	function refreshDay() {
		now = Date.now();
		const day = learningDay(now);
		if (day !== currentDay) {
			currentDay = day;
			homeQ.touch();
			wordsQ.touch();
			tasksQ.touch();
		}
	}
	onMount(() => {
		refreshDay();
		const timer = setInterval(refreshDay, 60_000);
		return () => clearInterval(timer);
	});

	function openDue(task: DueItem) {
		if (task.kind === 'quiz') openQuiz = task;
		else openAssignment = task;
	}

	let hero = $derived.by(() => {
		if (grading.length > 0) return {
			kind: 'grading' as const, label: 'Értékelésre vár', title: `${pendingCount} beadás vár rád`,
			description: grading.length === 1 ? grading[0].title : `${grading.length} feladat beadásait értékelheted.`,
			action: 'Értékelés', href: undefined
		};
		const urgent = dueTasks[0];
		if (urgent && urgent.dueDate - now <= 48 * 3_600_000) return {
			kind: 'task' as const, label: urgent.dueDate < now ? 'Pótold a feladatot' : 'Közeleg a határidő', title: urgent.title,
			description: `${urgent.roomName} · ${relativeDeadline(urgent.dueDate, now)}`, action: 'Feladat megnyitása', href: undefined
		};
		const language = words.find((word) => word.due > 0 || word.fresh > 0);
		if (language) return {
			kind: 'words' as const, label: 'Egy kis gyakorlás mára', title: `${language.subjectTitle} · ${language.due > 0 ? `${language.due} szó ismétlésre` : `${language.fresh} új szó`}`,
			description: language.due > 0 ? 'Elevenítsd fel, amit már megtanultál!' : 'Bővítsd a szókincsed néhány új szóval!',
			action: 'Gyakorlás', href: `/szavak/${encodeURIComponent(language.subjectId)}` as const
		};
		if (urgent) return {
			kind: 'task' as const, label: 'A következő feladatod', title: urgent.title,
			description: `${urgent.roomName} · ${relativeDeadline(urgent.dueDate, now)}`, action: 'Feladat megnyitása', href: undefined
		};
		const suggestion = stats?.suggestions?.[0];
		if (suggestion) return {
			kind: 'lesson' as const, label: 'Tanulás folytatása', title: suggestion.title,
			description: suggestion.subjectTitle, action: 'Folytatás', href: `/tanulas/lecke/${encodeURIComponent(suggestion.lessonId)}` as const
		};
		return {
			kind: 'lesson' as const, label: 'Ma is egy lépéssel előrébb', title: 'Mivel foglalkoznál ma?',
			description: 'Válassz egy tantárgyat, és tanulj a saját tempódban.', action: 'Tananyagok böngészése', href: '/tanulas' as const
		};
	});

	function openHero() {
		if (hero.kind === 'grading') openAssignment = grading[0];
		else if (hero.kind === 'task' && dueTasks[0]) openDue(dueTasks[0]);
	}
</script>

<svelte:head>
	<title>Kezdőlap | Leardy</title>
	<meta name="description" content="A következő tanulási lépésed, heti aktivitásod és közelgő feladataid egy helyen." />
</svelte:head>

<svelte:window onfocus={refreshDay} />

<header class="home-header">
	<div class="min-w-0">
		<p class="header-date">{dateFormat.format(new Date(now))}</p>
		<h1>Szia{firstName ? `, ${firstName}` : ''}!</h1>
	</div>
	<IconButton href={resolve('/beallitasok')} ariaLabel="Beállítások" size={44}>
		<Settings size={20} />
	</IconButton>
</header>

<div class="overview">
	<section class="next-step" aria-label="Következő teendő">
		{#if heroLoading}
			<div class="hero-skeleton" role="status" aria-label="Teendők betöltése">
				<Skeleton cls="h-3 w-32 rounded-full bg-white/20" />
				<Skeleton cls="mt-4 h-7 w-4/5 rounded-lg bg-white/20" />
				<Skeleton cls="mt-2 h-4 w-3/5 rounded-lg bg-white/20" />
				<Skeleton cls="mt-5 h-10 w-32 rounded-full bg-white/20" />
			</div>
		{:else}
			<div class="hero-eyebrow">
				<span>{hero.label}</span>
				{#if hero.kind === 'grading'}<ClipboardCheck size={19} aria-hidden="true" />
				{:else if hero.kind === 'task'}<CalendarDays size={19} aria-hidden="true" />
				{:else if hero.kind === 'words'}<Languages size={19} aria-hidden="true" />
				{:else}<BookOpen size={19} aria-hidden="true" />{/if}
			</div>
			<h2>{hero.title}</h2>
			<p class="hero-description">{hero.description}</p>
			{#if hero.href}
				<a class="hero-action" href={resolve(hero.href)}>{hero.action}<ArrowRight size={17} aria-hidden="true" /></a>
			{:else}
				<button class="hero-action" type="button" onclick={openHero}>{hero.action}<ArrowRight size={17} aria-hidden="true" /></button>
			{/if}
		{/if}
	</section>

	<section class="streak-card" aria-label="Tanulási sorozat">
		{#if homeLoading}
			<div role="status" aria-label="Aktivitás betöltése">
				<Skeleton cls="h-8 w-32 rounded-lg" />
				<Skeleton cls="mt-2 h-4 w-44 rounded-lg" />
				<div class="week skeleton-week">{#each dayLabels as _, index (index)}<Skeleton cls="size-8 rounded-full" />{/each}</div>
			</div>
		{:else if homeQ.error || !stats?.week}
			<div class="streak-heading"><span class="flame-tile"><Flame size={24} aria-hidden="true" /></span><h2>Tanulási sorozat</h2></div>
			<p class="streak-status">Az aktivitás most nem érhető el.</p>
			<button class="retry" type="button" onclick={loadHome}>Újrapróbálás</button>
		{:else}
			<div class="streak-heading">
				<span class="flame-tile"><Flame size={25} strokeWidth={2.2} aria-hidden="true" /></span>
				<div><h2>{stats.streak} nap</h2><p class="streak-label">Tanulási sorozat</p></div>
			</div>
			<ol class="week" aria-label="Heti aktivitás">
				{#each stats.week as day, index (day.date)}
					{@const today = day.date === stats.today}
					{@const future = day.date > stats.today}
					<li aria-current={today ? 'date' : undefined} aria-label={`${fullDayFormat.format(new Date(`${day.date}T12:00:00Z`))}: ${day.active ? 'tanultál' : today ? 'ma még nem tanultál' : future ? 'még előtted áll' : 'nem volt tanulás'}`}>
						<span class="day-label" class:is-today={today} aria-hidden="true">{dayLabels[index]}</span>
						<span class="day-dot" class:day-active={day.active} class:day-today={today} class:day-future={future} aria-hidden="true">
							{#if day.active}<Check size={16} strokeWidth={3} />{:else if future}<Minus size={12} />{:else}<span class="empty-dot"></span>{/if}
						</span>
					</li>
				{/each}
			</ol>
			<div class="daily-status">
				<span>Mai tanulás</span>
				<span class="daily-badge" class:completed={stats.todayActive}>
					{#if stats.todayActive}<Check size={14} aria-hidden="true" /><span>Teljesítve</span>
					{:else}<span>Még hátravan</span>{/if}
				</span>
			</div>
		{/if}
	</section>
</div>

{#if grading.length > 0}
	<section class="home-section" aria-labelledby="grading-title">
		<div class="section-heading"><h2 id="grading-title">Értékelésre vár</h2><span class="section-count">{pendingCount} beadás</span></div>
		<div class="item-list">
			{#each grading as assignment (assignment.id)}
				<Card onclick={() => (openAssignment = assignment)} ariaLabel={`Értékelendő: ${assignment.title}`}>
					<span class="item-row"><span class="item-icon grading-icon"><ClipboardCheck size={20} aria-hidden="true" /></span>
						<span class="item-content"><span class="item-title">{assignment.title}</span><span class="item-description">{assignment.roomName} · {assignment.pendingCount} értékelendő beadás</span></span>
						<ChevronRight size={18} class="item-chevron" aria-hidden="true" />
					</span>
				</Card>
			{/each}
		</div>
	</section>
{/if}

{#if wordsLoading || wordsQ.error || words.length > 0}
	<section class="home-section" aria-labelledby="words-title">
		<div class="section-heading"><h2 id="words-title">Szavak gyakorlása</h2><Languages size={18} class="section-symbol" aria-hidden="true" /></div>
		<div class="item-list">
			{#if wordsLoading}
				{@render loadingRows(1)}
			{:else if wordsQ.error}
				<div class="inline-message"><p>A szavak most nem érhetők el.</p><button class="retry" type="button" onclick={loadWords}>Újrapróbálás</button></div>
			{:else}
				{#each words as word (word.subjectId)}
					<Card href={resolve('/szavak/[subjectId]', { subjectId: word.subjectId })} ariaLabel={`${word.subjectTitle} szavak gyakorlása`}>
						<span class="item-row"><span class="item-icon words-icon"><Languages size={20} aria-hidden="true" /></span>
							<span class="item-content"><span class="item-title">{word.subjectTitle}</span><span class="item-description">{word.due > 0 ? `${word.due} szó ismétlésre` : word.fresh > 0 ? `${word.fresh} új szó vár rád` : 'Nincs esedékes ismétlés'}</span></span>
							{#if word.due > 0 && word.fresh > 0}<span class="fresh-count">+{word.fresh} új</span>{/if}
							<ChevronRight size={18} class="item-chevron" aria-hidden="true" />
						</span>
					</Card>
				{/each}
			{/if}
		</div>
	</section>
{/if}

<section class="home-section" aria-labelledby="tasks-title">
	<div class="section-heading"><h2 id="tasks-title">Határidős feladataim</h2>{#if dueTasks.length > 0}<span class="section-count">{dueTasks.length}</span>{/if}</div>
	<div class="item-list">
		{#if tasksQ.error}
			<div class="inline-message"><p>A feladatok most nem érhetők el.</p><button class="retry" type="button" onclick={loadTasks}>Újrapróbálás</button></div>
		{:else if tasksLoading}
			{@render loadingRows(2)}
		{:else if dueTasks.length === 0}
			<Card tone="tint">
				<div class="item-row">
					<span class="item-icon task-icon"><CalendarDays size={20} aria-hidden="true" /></span>
					<p class="item-content empty-task-label">Nincs határidős feladat</p>
				</div>
			</Card>
		{:else}
			{#each dueTasks as task (task.kind + ':' + task.id)}
				{@const late = task.dueDate < now}
				{@const soon = !late && task.dueDate - now <= 48 * 3_600_000}
				<Card onclick={() => openDue(task)} ariaLabel={`${task.title || (task.kind === 'quiz' ? 'Kvízfeladat' : 'Beadandó')}, ${relativeDeadline(task.dueDate, now)}`}>
					<span class="item-row"><span class="item-icon task-icon" class:late-icon={late}><CalendarDays size={20} aria-hidden="true" /></span>
						<span class="item-content"><span class="item-title">{task.title || (task.kind === 'quiz' ? 'Kvízfeladat' : 'Beadandó')}</span><span class="item-description">{task.roomName} · {task.kind === 'quiz' ? 'Kvíz' : 'Beadandó'}</span>
							<span class="deadline" class:late class:soon><time datetime={new Date(task.dueDate).toISOString()} title={dueFormat.format(new Date(task.dueDate))}>{relativeDeadline(task.dueDate, now)}</time></span>
						</span>
						<ChevronRight size={18} class="item-chevron" aria-hidden="true" />
					</span>
				</Card>
			{/each}
		{/if}
	</div>
</section>

{#snippet loadingRows(count: number)}
	<div class="item-list" role="status" aria-label="Betöltés">
		{#each Array.from({ length: count }) as _, index (index)}
			<Card><div class="item-row"><Skeleton cls="size-10 shrink-0 rounded-xl" /><div class="item-content"><Skeleton cls="h-4 w-2/3 rounded-lg" /><Skeleton cls="mt-2 h-3 w-1/2 rounded-lg" /></div></div></Card>
		{/each}
	</div>
{/snippet}

<TaskDetailDrawer task={openQuiz} onClose={() => (openQuiz = null)} onChanged={() => tasksQ.touch()} />
<AssignmentDetailDrawer assignment={openAssignment} onClose={() => (openAssignment = null)} onChanged={() => tasksQ.touch()} />

<style>
	.home-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.header-date { color: var(--color-ink-600); font-size: 12px; margin-bottom: 3px; }
	h1, h2, .item-title { font-family: var(--font-display); }
	h1 { font-size: 28px; font-weight: 800; letter-spacing: -.04em; line-height: 1.2; overflow-wrap: anywhere; }
	.overview { display: grid; gap: 12px; margin-top: 20px; }
	.next-step { padding: 20px; border-radius: var(--radius-card); background: var(--color-brand-600); color: white; display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
	.hero-eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; color: #dfe3ff; font-size: 12px; font-weight: 600; }
	.next-step h2 { font-size: 25px; font-weight: 800; letter-spacing: -.035em; line-height: 1.15; margin-top: 12px; overflow-wrap: anywhere; }
	.hero-description { color: #dfe3ff; font-size: 13px; line-height: 1.5; margin-top: 7px; margin-bottom: 18px; overflow-wrap: anywhere; }
	.hero-action { display: inline-flex; justify-content: center; align-items: center; gap: 10px; margin-top: auto; min-height: 44px; padding: 10px 16px; background: white; border-radius: 999px; color: var(--color-brand-700); font-size: 13px; font-weight: 750; cursor: pointer; transition: background .15s; }
	.hero-action:hover { background: #eef0ff; }
	.hero-action:focus-visible { outline-color: white; }
	.hero-skeleton { width: 100%; min-height: 168px; }
	.streak-card { padding: 18px 20px; border: 1px solid #f5e8d8; border-radius: var(--radius-card); background: #fffbf5; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
	.streak-heading { display: flex; align-items: center; gap: 10px; }
	.flame-tile { display: grid; place-items: center; flex-shrink: 0; width: 42px; height: 42px; background: #ffedd9; color: #ba471b; border-radius: 14px; }
	.streak-heading h2 { font-size: 23px; line-height: 1.1; font-weight: 800; letter-spacing: -.035em; }
	.streak-label { font-size: 11px; color: #85674b; margin-top: 3px; }
	.week { display: flex; justify-content: space-between; gap: 5px; margin-top: 16px; }
	.week li { display: flex; flex-direction: column; align-items: center; gap: 6px; }
	.day-label { font-size: 10px; font-weight: 600; color: #85674b; }
	.day-label.is-today { color: #a74320; font-weight: 800; }
	.day-dot { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: #f0e8de; color: #a89987; }
	.day-dot.day-future { background: transparent; border: 1px dashed #dfd3c3; }
	.day-dot.day-active { background: #c65329; color: white; }
	.day-dot.day-today { outline: 2px solid #c65329; outline-offset: 3px; }
	.empty-dot { width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
	.streak-status { display: flex; align-items: center; gap: 5px; font-size: 11px; line-height: 1.5; color: #85674b; margin-top: 14px; }
	.daily-status { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 16px; padding-top: 12px; border-top: 1px solid #f0e3d3; color: #85674b; font-size: 12px; line-height: 1.4; }
	.daily-badge { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; padding: 5px 9px; border-radius: 8px; background: #f0e8de; color: #735b44; font-size: 11px; font-weight: 650; }
	.daily-badge.completed { background: #e4f1e8; color: #35724b; }
	.skeleton-week { margin-top: 24px; }
	.home-section { margin-top: 28px; }
	.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; padding: 0 2px; }
	.section-heading h2 { font-size: 18px; font-weight: 800; letter-spacing: -.025em; }
	.section-count { font-size: 12px; color: var(--color-ink-600); }
	.section-heading :global(.section-symbol) { color: var(--color-ink-400); }
	.item-list { display: grid; gap: 8px; }
	.item-row { display: flex; align-items: center; gap: 12px; }
	.item-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 13px; flex-shrink: 0; }
	.words-icon { background: var(--color-brand-50); color: var(--color-brand-600); }
	.grading-icon { background: #f1edff; color: #7652b5; }
	.task-icon { background: #f3f3f2; color: #79776f; }
	.task-icon.late-icon { background: #fff0ed; color: #b84235; }
	.item-content { display: block; min-width: 0; flex: 1; }
	.item-title { display: block; font-size: 15px; font-weight: 750; line-height: 1.35; overflow-wrap: anywhere; }
	.item-description { display: block; font-size: 12px; line-height: 1.5; color: var(--color-ink-600); margin-top: 3px; overflow-wrap: anywhere; }
	.item-row :global(.item-chevron) { color: var(--color-ink-400); flex-shrink: 0; }
	.fresh-count { font-size: 11px; font-weight: 600; color: var(--color-ink-600); flex-shrink: 0; }
	.deadline { display: inline-block; margin-top: 7px; font-size: 11px; font-weight: 650; color: var(--color-ink-600); }
	.deadline.late { color: #b84235; }
	.deadline.soon { background: #fff3df; color: #8c5610; padding: 2px 8px; border-radius: 6px; }
	.empty-task-label { color: var(--color-ink-600); font-size: 13px; line-height: 1.5; }
	.inline-message { padding: 12px 2px; color: var(--color-ink-600); font-size: 13px; }
	.retry { display: inline-flex; align-items: center; min-height: 44px; color: var(--color-brand-600); font-size: 12px; font-weight: 700; cursor: pointer; }
	@media (min-width: 640px) {
		h1 { font-size: 32px; }
		.overview { grid-template-columns: 1.15fr 1fr; gap: 14px; }
		.next-step { padding: 22px; }
		.next-step h2 { font-size: 27px; }
	}
	:global(.dark) .header-date, :global(.dark) .item-description, :global(.dark) .section-count, :global(.dark) .fresh-count, :global(.dark) .empty-task-label, :global(.dark) .inline-message { color: #a8a5a0; }
	:global(.dark) .streak-card { background: #211b16; border-color: #3d2e23; }
	:global(.dark) .flame-tile { background: #3f291b; color: #ffad75; }
	:global(.dark) .streak-label, :global(.dark) .day-label, :global(.dark) .streak-status { color: #c3aa91; }
	:global(.dark) .day-label.is-today { color: #ffad75; }
	:global(.dark) .day-dot { background: #3c3026; color: #ac947d; }
	:global(.dark) .day-dot.day-active { background: #c65329; color: white; }
	:global(.dark) .day-dot.day-future { background: transparent; border-color: #604630; }
	:global(.dark) .day-dot.day-today { outline-color: #ffad75; }
	:global(.dark) .daily-status { border-color: #3d2e23; color: #c3aa91; }
	:global(.dark) .daily-badge { background: #3c3026; color: #d4bea9; }
	:global(.dark) .daily-badge.completed { background: #1b3526; color: #a3d6b3; }
	:global(.dark) .words-icon { background: #252846; color: #acb6ff; }
	:global(.dark) .grading-icon { background: #30253e; color: #cbb1ef; }
	:global(.dark) .task-icon { background: #292723; color: #bcb7ad; }
	:global(.dark) .late-icon { background: #3c231e; color: #ffb4a5; }
	:global(.dark) .deadline { color: #a8a5a0; }
	:global(.dark) .deadline.late { color: #ffb4a5; }
	:global(.dark) .deadline.soon { background: #3b2d18; color: #f7ce8a; }
	:global(.dark) .retry { color: #acb6ff; }
	@media (prefers-reduced-motion: reduce) { .hero-action { transition: none; } }
</style>

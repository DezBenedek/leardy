<script lang="ts">
	import { goto } from '$app/navigation';
	import { CalendarDays, ChevronRight, Flame, Languages, Settings } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { Query } from '$lib/query.svelte';
	import TaskDetailDrawer, { type TaskDetail } from '$lib/components/TaskDetailDrawer.svelte';
	import AssignmentDetailDrawer, { type AssignmentDetail } from '$lib/components/AssignmentDetailDrawer.svelte';
	import Card from '$lib/ui/Card.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let homeQ = new Query<{ streak: number }>();

	interface LangDue {
		subjectId: string;
		subjectTitle: string;
		due: number;
		fresh: number;
		total: number;
		packs: number;
		linkId: string;
	}

	let wordsQ = new Query<{ languages: LangDue[] }>();

	let words = $derived(wordsQ.data?.languages ?? []);
	let wordsLoading = $derived(wordsQ.data == null && !wordsQ.error);

	type DueQuiz = TaskDetail & { kind: 'quiz' };
	type DueAssignment = AssignmentDetail & { dueDate: number } & { kind: 'assignment' };
	type DueItem = DueQuiz | DueAssignment;

	type GradingItem = AssignmentDetail & { kind: 'assignment'; pendingCount: number };
	let tasksQ = new Query<{ tasks: DueItem[]; grading: GradingItem[] }>();
	let grading = $derived(tasksQ.data?.grading ?? []);

	let streak = $derived(homeQ.data?.streak ?? null);

	let dueTasks = $derived(tasksQ.data?.tasks ?? []);
	let tasksLoading = $derived(tasksQ.data == null && !tasksQ.error);
	let tasksFailed = $derived(tasksQ.error);

	let openQuiz = $state<DueQuiz | null>(null);
	let openAssignment = $state<AssignmentDetail | null>(null);

	function openDue(t: DueItem) {
		if (t.kind === 'quiz') openQuiz = t;
		else openAssignment = t;
	}

	const dueFmt = new Intl.DateTimeFormat('hu-HU', {
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	function fmtDue(ts: number): string {
		return dueFmt.format(new Date(ts));
	}

	let user = $derived(auth.ready ? auth.user : (data.user ?? null));
	let firstName = $derived(user?.name.trim().split(/\s+/)[0] ?? '');

	/* Gyorstár-ablakok: friss = nincs hálózat, öreg = mutatható + csendben frissül. */
	const HOME_TTL = 5 * 60_000;
	const HOME_STALE = 15 * 60_000;

	// Első paint előtti előtöltés + azonnali betöltés (nincs reaktív kulcs).
	homeQ.prime('home', HOME_STALE);
	homeQ.load(
		'home',
		async () => {
			const res = await fetch('/api/home');
			if (!res.ok) throw new Error('home failed');
			const j = await res.json();
			return { streak: j.streak ?? 0 };
		},
		HOME_TTL,
		HOME_STALE
	);

	// Határidős osztályfeladatok időrendben.
	function loadDueTasks() {
		tasksQ.load(
			'home-tasks',
			async () => {
				const res = await fetch('/api/home/tasks');
				if (!res.ok) throw new Error('home tasks failed');
				const j = await res.json();
				return { tasks: j.tasks ?? [], grading: j.grading ?? [] };
			},
			HOME_TTL,
			HOME_STALE
		);
	}
	loadDueTasks();

	// Nyelvi szavak esedékessége a könyvtár alapján (Angol, Német, Olasz, Spanyol).
	wordsQ.prime('sm2-due', HOME_STALE);
	wordsQ.load(
		'sm2-due',
		async () => {
			try {
				const res = await fetch('/api/sm2-due');
				if (!res.ok) return { languages: [] };
				const j = await res.json();
				return { languages: j.languages ?? [] };
			} catch {
				return { languages: [] };
			}
		},
		HOME_TTL,
		HOME_STALE
	);

	function goWords(subjectId: string) {
		void goto(`/szavak/${encodeURIComponent(subjectId)}`);
	}
</script>

<svelte:head>
	<title>Kezdőlap | Leardy</title>
	<meta name="description" content="Határidős feladataid időrendi sorrendben." />
</svelte:head>

<header class="flex items-center gap-3">
	<div class="min-w-0 flex-1">
		<p class="text-[13px] font-bold tracking-wider text-stone-400 uppercase dark:text-stone-500">
			Leardy
		</p>
		<h1 class="font-display truncate text-[24px] leading-tight font-extrabold tracking-tight text-ink-900 sm:text-[28px] dark:text-white">
			Szia{firstName ? `, ${firstName}` : ''}!
		</h1>
	</div>
	<IconButton href="/beallitasok" ariaLabel="Beállítások" size={46}>
		<Settings size={20} />
	</IconButton>
</header>

<section aria-label="Széria" class="mt-4">
	<Card tone="brand" pad="md">
		<div class="flex items-center gap-3">
			<span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-2xl">
				<Flame size={30} color="#eb6734" strokeWidth={3}/>
			</span>
			<div class="min-w-0">
				<p class="font-display text-[22px] leading-tight font-extrabold">
					{streak === null ? '…' : `${streak} napos sorozat`}
				</p>
			</div>
		</div>
	</Card>
</section>

{#if wordsLoading || words.length > 0}
	<section aria-label="Szavak gyakorlása" class="mt-5">
		<h2 class="font-display px-1 text-[19px] font-extrabold tracking-tight text-ink-900 dark:text-white">
			Szavak gyakorlása
		</h2>
		<div class="mt-2.5">
			{#if wordsLoading}
				<div role="status" aria-label="Betöltés" class="grid gap-2.5">
					<Card>
						<span class="flex items-center gap-3">
							<span class="min-w-0 flex-1 space-y-2">
								<Skeleton cls="h-[18px] w-2/3 rounded-lg" />
								<Skeleton cls="h-5 w-24 rounded-full" />
							</span>
							<Skeleton cls="size-5 shrink-0 rounded-full" />
						</span>
					</Card>
					<span class="sr-only">Betöltés…</span>
				</div>
			{:else}
				<div class="grid gap-2.5">
					{#each words as w (w.subjectId)}
						<Card onclick={() => goWords(w.subjectId)} ariaLabel="{w.subjectTitle} szavak gyakorlása">
							<span class="flex items-center gap-3">
								<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300" aria-hidden="true">
									<Languages size={19} />
								</span>
								<span class="min-w-0 flex-1">
									<span class="font-display block truncate text-[16px] font-extrabold text-ink-900 dark:text-white">
										{w.subjectTitle} szavak gyakorlása
									</span>
									<span class="mt-0.5 block truncate text-[12px] font-bold text-stone-500 dark:text-stone-400">
										{w.due} esedékes · {w.fresh} új · {w.total} szó · {w.packs} csomag
									</span>
								</span>
								<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
							</span>
						</Card>
					{/each}
				</div>
			{/if}
		</div>
	</section>
{/if}

<section aria-label="Határidős feladataim" class="mt-5">
	<h2 class="font-display px-1 text-[19px] font-extrabold tracking-tight text-ink-900 dark:text-white">
		Határidős feladataim
	</h2>
	<div class="mt-2.5">
		{#if tasksFailed}
			<EmptyState
				title="Nem sikerült betölteni"
				description="A határidős feladatok most nem érhetők el. Próbáld újra később."
			/>
		{:else if tasksLoading}
			<div role="status" aria-label="Betöltés" class="grid gap-2.5">
				{#each [0, 1] as i (i)}
					<Card>
						<span class="flex items-center gap-3">
							<span class="min-w-0 flex-1 space-y-2">
								<Skeleton cls="h-[18px] w-2/3 rounded-lg" />
								<Skeleton cls="h-5 w-24 rounded-full" />
							</span>
							<Skeleton cls="size-5 shrink-0 rounded-full" />
						</span>
					</Card>
				{/each}
				<span class="sr-only">Betöltés…</span>
			</div>
		{:else if dueTasks.length === 0}
			<EmptyState
				title="Nincs határidős feladat"
			/>
		{:else}
			<div class="grid gap-2.5">
				{#each dueTasks as t (t.kind + ':' + t.id)}
					{@const late = t.dueDate < Date.now()}
					<Card onclick={() => openDue(t)} ariaLabel={t.title}>
						<span class="flex items-center gap-3">
							<span class="min-w-0 flex-1">
								<span class="font-display block truncate text-[16px] font-extrabold text-ink-900 dark:text-white">
									{t.title || (t.kind === 'quiz' ? 'Kvízfeladat' : 'Beadandó')}
								</span>
								<span class="mt-1 flex flex-wrap items-center gap-1.5">
									<span class="inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-[12px] font-bold text-brand-600 dark:bg-brand-500/20 dark:text-white">
										{t.roomName}
									</span>
									<span class="inline-block rounded-full {t.kind === 'quiz' ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'} px-2.5 py-0.5 text-[12px] font-bold">
										{t.kind === 'quiz' ? 'Kvíz' : 'Beadandó'}
									</span>
									<span class="inline-flex items-center gap-1 text-[12px] font-bold {late ? 'text-red-600 dark:text-red-300' : 'text-stone-500 dark:text-stone-400'}">
										<CalendarDays size={13} />
										{late ? 'Lejárt: ' : ''}{fmtDue(t.dueDate)}
									</span>
								</span>
							</span>
							<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
						</span>
					</Card>
				{/each}
			</div>
		{/if}
	</div>
</section>

{#if grading.length > 0}
	<section aria-label="Értékelendő" class="mt-5">
		<h2 class="font-display px-1 text-[19px] font-extrabold tracking-tight text-ink-900 dark:text-white">Értékelendő</h2>
		<div class="mt-2.5 grid gap-2.5">
			{#each grading as assignment (assignment.id)}
				<Card onclick={() => (openAssignment = assignment)} ariaLabel={`Értékelendő: ${assignment.title}`}>
					<span class="flex min-w-0 items-center gap-3">
						<span class="min-w-0 flex-1">
							<span class="block break-words [overflow-wrap:anywhere] text-[16px] font-extrabold text-ink-900 dark:text-white">{assignment.title}</span>
							<span class="mt-1 block break-words text-[13px] text-stone-500 dark:text-stone-400">{assignment.roomName} · {assignment.pendingCount} értékelendő beadás</span>
						</span>
						<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
					</span>
				</Card>
			{/each}
		</div>
	</section>
{/if}

<TaskDetailDrawer task={openQuiz} onClose={() => (openQuiz = null)} onChanged={() => tasksQ.touch()} />
<AssignmentDetailDrawer assignment={openAssignment} onClose={() => (openAssignment = null)} onChanged={() => tasksQ.touch()} />

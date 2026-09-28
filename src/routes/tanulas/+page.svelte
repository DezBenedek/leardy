<script lang="ts">
	import { untrack } from 'svelte';
	import { Check, ChevronRight, Zap } from '@lucide/svelte';
	import QuickPractice from '$lib/components/QuickPractice.svelte';
	import ScopePickers from '$lib/components/ScopePickers.svelte';
	import type { Package, QuizQuestion, SubjectTree } from '$lib/curriculum';
	import { Query, getOrFetch, peek } from '$lib/query.svelte';
	import { loadScope, saveScope } from '$lib/scope';
	import { loadSettings } from '$lib/settings';
	import Card from '$lib/ui/Card.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* Gyorstár-ablakok: friss = nincs hálózat, öreg = mutatható + csendben frissül. */
	const TREE_TTL = 10 * 60_000;
	const TREE_STALE = 30 * 60_000;
	const PACKAGES_TTL = 10 * 60_000;

	const savedScope = loadScope('tanulas');
	let subjectId = $state(savedScope.subject);
	let levelId = $state(savedScope.level);
	const treeQ = new Query<SubjectTree | null>();

	// Első paint előtti előtöltés: visszalépéskor rögtön adat, skeleton nélkül.
	untrack(() => {
		treeQ.prime(subjectId ? `tree:${subjectId}` : null, TREE_STALE);
	});

	// Mentett tantárgy érvényesítése, különben az első.
	$effect(() => {
		if (!subjectId || !data.subjects.some((s) => s.id === subjectId)) {
			if (data.subjects[0]) subjectId = data.subjects[0].id;
		}
	});

	let qpOpen = $state(false);
	let qpicks = $state<QuizQuestion[]>([]);

	let levels = $derived(treeQ.data?.levels ?? []);
	let filteredLevels = $derived(
		levels.filter((l) => (levelId ? l.id === levelId : true))
	);

	async function fetchTreeRaw(id: string): Promise<SubjectTree | null> {
		try {
			const res = await fetch(`/api/browse?subject=${encodeURIComponent(id)}`);
			const j = await res.json();
			return res.ok ? (j.tree ?? null) : null;
		} catch {
			return null;
		}
	}

	// Szint-választó csak a választott tantárgy szintjeit mutatja; üres = mind.
	// A fa gyorstárból jön: visszalépéskor azonnal rajzol, csendben frissül.
	// Visszatöltött szintet az első betöltés nem nullázza, váltáskor igen.
	let prevSubject = $state<string | null>(null);

	$effect(() => {
		if (prevSubject !== null && prevSubject !== subjectId) levelId = '';
		prevSubject = subjectId;
		treeQ.load(subjectId ? `tree:${subjectId}` : null, () => fetchTreeRaw(subjectId), TREE_TTL, TREE_STALE);
	});

	// Mentett szint érvényesítése.
	$effect(() => {
		const ls = treeQ.data?.levels;
		if (ls && levelId && !ls.some((l) => l.id === levelId)) levelId = '';
	});

	// Utolsó választás mentése.
	$effect(() => {
		saveScope('tanulas', { subject: subjectId, level: levelId });
	});

	function shuffle<T>(arr: T[]): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	async function fetchPackagesRaw(): Promise<Package[]> {
		try {
			const params = new URLSearchParams();
			if (subjectId) params.set('subject', subjectId);
			if (levelId) params.set('level', levelId);
			const res = await fetch(`/api/packages?${params}`);
			const j = await res.json();
			return res.ok ? (j.packages ?? []) : [];
		} catch {
			return [];
		}
	}

	/** Villamkviz: csak a jelenlegi szuresbe eso, zold pipas (teljesitett) leckekbol. */
	async function openQuickPractice() {
		const key = `packages:${subjectId}:${levelId}`;
		const n = loadSettings().quickQuizCount;
		const doneIds = new Set(
			filteredLevels.flatMap((l) =>
				l.materials.flatMap((m) => m.lessons.filter((le) => le.done).map((le) => le.id))
			)
		);
		try {
			const pkgs = await getOrFetch(key, fetchPackagesRaw, PACKAGES_TTL);
			qpicks = shuffle(
				pkgs.filter((p) => p.lessonId && doneIds.has(p.lessonId)).flatMap((p) => p.questions)
			).slice(0, n);
		} catch {
			const stale = peek<Package[]>(key, Number.POSITIVE_INFINITY) ?? [];
			qpicks = shuffle(
				stale.filter((p) => p.lessonId && doneIds.has(p.lessonId)).flatMap((p) => p.questions)
			).slice(0, n);
		}
		qpOpen = true;
	}

</script>

<svelte:head>
	<title>Tanulás | Leardy</title>
	<meta name="description" content="Tantárgyak, szintek és leckék böngészése." />
</svelte:head>

<div class="flex items-stretch gap-2">
	<ScopePickers subjects={data.subjects} {levels} bind:subjectId bind:levelId />
	<div class="grid shrink-0 place-items-center">
		<IconButton ariaLabel="Gyors gyakorlás" size={46} onclick={openQuickPractice}>
			<Zap size={22} />
		</IconButton>
	</div>
</div>

<div class="mt-4">
	{#if treeQ.loading}
		<div role="status" aria-label="Betöltés" class="grid gap-2.5">
			{#each [0, 1] as i (i)}
				<Card>
					<Skeleton cls="h-[18px] w-2/5 rounded-lg" />
					<div class="mt-3 space-y-2.5">
						<Skeleton cls="h-4 w-full rounded-md" />
						<Skeleton cls="h-4 w-11/12 rounded-md" />
						<Skeleton cls="h-4 w-3/4 rounded-md" />
					</div>
				</Card>
			{/each}
			<span class="sr-only">Betöltés…</span>
		</div>
	{:else if !treeQ.data || filteredLevels.length === 0}
		<EmptyState
			title="Nincs tananyag"
			description="Ehhez a választáshoz most nincs megjeleníthető lecke."
		/>
	{:else}
		{@const singleLevel = levelId !== ''}
		<div class="grid gap-4">
			{#each filteredLevels as level (level.id)}
				<section aria-label={level.title}>
					{#if !singleLevel}
						<h2 class="font-display px-1 text-[17px] font-extrabold tracking-tight text-ink-900 dark:text-white">
							{level.title}
						</h2>
					{/if}
					<div class="{singleLevel ? '' : 'mt-2 '}grid gap-2.5">
						{#each level.materials as mat (mat.id)}
							<Card>
								<p class="text-[15px] font-extrabold text-ink-900 dark:text-white">{mat.title}</p>
								<ul class="mt-2 divide-y divide-stone-100 dark:divide-white/5">
									{#each mat.lessons as le (le.id)}
										<li>
											<a
												href="/lecke/{le.id}"
												class="flex items-center gap-2 py-2 text-[14px] font-semibold text-ink-600 transition hover:text-brand-600 dark:text-stone-300 dark:hover:text-white"
											>
												{#if le.done}
													<span class="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white" aria-label="Teljesítve">
														<Check size={13} strokeWidth={3.5} aria-hidden="true" />
													</span>
												{/if}
												<span class="min-w-0 flex-1 truncate">{le.title}</span>
												<ChevronRight size={16} class="shrink-0 text-stone-300 dark:text-stone-600" />
											</a>
										</li>
									{/each}
								</ul>
							</Card>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>

<QuickPractice questions={qpicks} open={qpOpen} onClose={() => (qpOpen = false)} />

<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { untrack } from 'svelte';
	import {
		ArrowDownAZ,
		BookOpenText,
		Check,
		ChevronDown,
		ChevronRight,
		Dices,
		Gauge,
		Landmark,
		Languages,
		Layers,
		Leaf,
		ListOrdered,
		Play,
		Shapes,
		SlidersHorizontal,
		Trash2
	} from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import QuickPractice from '$lib/components/QuickPractice.svelte';
	import type { LevelNode, Package, QuizQuestion, SubjectTree } from '$lib/curriculum';
	import { normHu } from '$lib/deck-history';
	import { loadLastLesson } from '$lib/lesson-history';
	import { Query, getOrFetch, peek } from '$lib/query.svelte';
	import { loadScope, saveScope } from '$lib/scope';
	import { loadSettings } from '$lib/settings';
	import { toast } from '$lib/toast.svelte';
	import Card from '$lib/ui/Card.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import SearchInput from '$lib/ui/SearchInput.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* Gyorstár-ablakok: friss = nincs hálózat, öreg = mutatható + csendben frissül. */
	const TREE_TTL = 10 * 60_000;
	const TREE_STALE = 30 * 60_000;
	const PACKAGES_TTL = 10 * 60_000;
	const SORT_KEY = 'leardy-tanulas-sort';

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
	let activeSubject = $derived(data.subjects.find((s) => s.id === subjectId) ?? null);
	let activeLevelTitle = $derived(
		levelId ? (levels.find((l) => l.id === levelId)?.title ?? 'Szint') : 'Minden szint'
	);

	const subjectIcons: Record<string, typeof Landmark> = {
		landmark: Landmark,
		leaf: Leaf,
		languages: Languages,
		book: BookOpenText
	};
	let ScopeIcon = $derived(
		activeSubject ? (subjectIcons[activeSubject.icon] ?? Shapes) : Shapes
	);

	/* Tantárgy és szint választó drawer: előbb a tantárgy-lista, rákattintva
	   a szint-lista, onnan vissza-nyíllal vissza. A választás a szintre
	   koppintva lép életbe és zárja a drawert. */
	let scopeOpen = $state(false);
	let scopeStep = $state<'subject' | 'level'>('subject');
	let pendingSubjectId = $state('');
	let pendingLevels = $state<LevelNode[]>([]);
	let pendingLoading = $state(false);
	let scopeGen = 0;

	let pendingSubject = $derived(data.subjects.find((s) => s.id === pendingSubjectId) ?? null);
	let pendingLevelLabelLow = $derived((pendingSubject?.levelLabel || 'Szint').toLowerCase());

	function openScope() {
		scopeStep = 'subject';
		pendingSubjectId = '';
		pendingLevels = [];
		pendingLoading = false;
		scopeOpen = true;
	}

	function closeScope() {
		scopeOpen = false;
	}

	function backToSubjects() {
		scopeStep = 'subject';
		pendingSubjectId = '';
	}

	async function goSubject(id: string) {
		pendingSubjectId = id;
		scopeStep = 'level';
		const gen = ++scopeGen;
		if (id === subjectId && treeQ.data) {
			pendingLevels = treeQ.data.levels;
			pendingLoading = false;
			return;
		}
		pendingLoading = true;
		try {
			const res = await fetch(`/api/browse?subject=${encodeURIComponent(id)}`);
			const j = await res.json().catch(() => ({}));
			if (gen !== scopeGen) return;
			pendingLevels = res.ok && j.tree ? (j.tree.levels ?? []) : [];
		} catch {
			if (gen === scopeGen) pendingLevels = [];
		} finally {
			if (gen === scopeGen) pendingLoading = false;
		}
	}

	/* Drawer-ből választva a szint őr nem nullázhat: a váltás előtt
	   átállítjuk az előzőt, így az effect nem érzékel tantárgyváltást. */
	let prevSubject = $state<string | null>(null);

	function pickLevel(lid: string) {
		const sid = pendingSubjectId;
		prevSubject = sid;
		subjectId = sid;
		levelId = lid;
		scopeOpen = false;
	}

	async function fetchTreeRaw(id: string): Promise<SubjectTree | null> {
		try {
			const res = await fetch(`/api/browse?subject=${encodeURIComponent(id)}`);
			const j = await res.json();
			return res.ok ? (j.tree ?? null) : null;
		} catch {
			return null;
		}
	}

	// Visszatöltött szintet az első betöltés nem nullázza, váltáskor igen.
	$effect(() => {
		if (prevSubject !== null && prevSubject !== subjectId) levelId = '';
		prevSubject = subjectId;
		treeQ.load(subjectId ? `tree:${subjectId}` : null, () => fetchTreeRaw(subjectId), TREE_TTL, TREE_STALE);
	});

	// Mentett szint érvényesítése, de csak kész fához: tantárgyváltáskor
	// a régi fa még látszhat töltés alatt, az nem érvénytelenítheti az új szintet.
	$effect(() => {
		if (treeQ.loading) return;
		const ls = treeQ.data?.levels;
		if (ls && levelId && !ls.some((l) => l.id === levelId)) levelId = '';
	});

	// Utolsó választás mentése.
	$effect(() => {
		saveScope('tanulas', { subject: subjectId, level: levelId });
	});

	/* Keresés + szűrő + rendezés. A kereső fókuszban kinyílik, a fejléc
	   gombjai összehúzódnak (Kártya oldal mintája). A rendezés a szűrőben él. */
	let query = $state('');
	let searchFocus = $state(false);
	let filterOpen = $state(false);
	let fPicker = $state<'sort' | null>(null);
	let status = $state<'all' | 'done' | 'todo'>('all');

	function loadTanulasSort(): string {
		if (typeof localStorage === 'undefined') return 'eredeti';
		const v = localStorage.getItem(SORT_KEY);
		return v === 'nev' || v === 'haladas' ? v : 'eredeti';
	}

	let sortId = $state(loadTanulasSort());

	const sortOptions = [
		{ id: 'eredeti', title: 'Eredeti sorrend', desc: 'A tananyag sorrendje', icon: ListOrdered },
		{ id: 'nev', title: 'Név szerint', desc: 'A-tól Z-ig', icon: ArrowDownAZ },
		{ id: 'haladas', title: 'Haladás szerint', desc: 'A legkevésbé teljesített elöl', icon: Gauge }
	];

	let sortTitle = $derived(sortOptions.find((o) => o.id === sortId)?.title ?? 'Rendezés');

	let activeFilterCount = $derived(
		(sortId !== 'eredeti' ? 1 : 0) + (status !== 'all' ? 1 : 0)
	);

	function resetFilters() {
		sortId = 'eredeti';
		status = 'all';
	}

	$effect(() => {
		try {
			localStorage.setItem(SORT_KEY, sortId);
		} catch {
			// tiltott storage
		}
	});

	/* Látható szintek: szintszűrés, állapot, keresés, rendezés. Üres témakör
	   és üres szint nem rajzolódik ki. */
	let visibleLevels = $derived.by(() => {
		const q = normHu(query.trim());
		let ls = levels.filter((l) => (levelId ? l.id === levelId : true));
		if (sortId === 'nev') ls = [...ls].sort((a, b) => a.title.localeCompare(b.title, 'hu'));
		return ls
			.map((l) => {
				let mats = l.materials
					.map((m) => {
						let les = m.lessons.filter((le) => {
							if (status === 'done' && !le.done) return false;
							if (status === 'todo' && le.done) return false;
							if (q && !normHu(`${m.title} ${le.title}`).includes(q)) return false;
							return true;
						});
						if (sortId === 'nev') les = [...les].sort((a, b) => a.title.localeCompare(b.title, 'hu'));
						else if (sortId === 'haladas')
							les = [...les].sort(
								(a, b) => Number(a.done) - Number(b.done) || a.title.localeCompare(b.title, 'hu')
							);
						const total = m.lessons.length;
						const done = m.lessons.filter((x) => x.done).length;
						return { ...m, lessons: les, doneCount: done, totalCount: total };
					})
					.filter((m) => m.lessons.length > 0);
				if (sortId === 'nev') mats = [...mats].sort((a, b) => a.title.localeCompare(b.title, 'hu'));
				else if (sortId === 'haladas')
					mats = [...mats].sort(
						(a, b) => doneRatio(a.doneCount, a.totalCount) - doneRatio(b.doneCount, b.totalCount)
					);
				return { ...l, materials: mats };
			})
			.filter((l) => l.materials.length > 0);
	});

	function doneRatio(done: number, total: number): number {
		return total === 0 ? 0 : done / total;
	}

	/* Témakör-kártyák lenyitása. Kereséskor minden találat nyitva van. */
	let collapsed = $state<Record<string, boolean>>({});

	function isMatOpen(id: string): boolean {
		if (query.trim() !== '') return true;
		return !collapsed[id];
	}

	function toggleMat(id: string) {
		collapsed = { ...collapsed, [id]: !collapsed[id] };
	}

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

	function pickRandom(questions: QuizQuestion[]): QuizQuestion[] {
		return shuffle(questions).slice(0, loadSettings().quickQuizCount);
	}

	/* Jobb felső gomb: az utoljára megnyitott lecke folytatása ott, ahol abbahagytad. */
	let lastLesson = $state<{ id: string; title: string } | null>(null);

	onMount(() => {
		lastLesson = loadLastLesson();
	});

	/** Folytatás: az utolsó lecke megnyitása, előzmény nélkül az első lecke. */
	function continueLastLesson() {
		const last = loadLastLesson() ?? lastLesson;
		if (last?.id) {
			lastLesson = last;
			void goto(`/lecke/${encodeURIComponent(last.id)}`);
			return;
		}
		const fallback = visibleLevels
			.flatMap((l) => l.materials.flatMap((m) => m.lessons))
			.find((le) => !le.done) ?? visibleLevels.flatMap((l) => l.materials.flatMap((m) => m.lessons))[0];
		if (fallback) {
			void goto(`/lecke/${encodeURIComponent(fallback.id)}`);
			return;
		}
		toast.warning('Nincs folytatható lecke', 'Nyiss meg egy leckét a listából!');
	}

	/** Témakör play: véletlen kvíz a témakör leckéiből. */
	async function playMaterial(lessonIds: string[]) {
		const key = `packages:${subjectId}:${levelId}`;
		const wanted = new Set(lessonIds);
		try {
			const pkgs = await getOrFetch(key, fetchPackagesRaw, PACKAGES_TTL);
			qpicks = pickRandom(
				pkgs.filter((p) => p.lessonId && wanted.has(p.lessonId)).flatMap((p) => p.questions)
			);
		} catch {
			const stale = peek<Package[]>(key, Number.POSITIVE_INFINITY) ?? [];
			qpicks = pickRandom(
				stale.filter((p) => p.lessonId && wanted.has(p.lessonId)).flatMap((p) => p.questions)
			);
		}
		qpOpen = true;
	}

	const pickRowBtn =
		'flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 text-left transition hover:bg-stone-50 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5';
	const optRowBtn =
		'flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100';
	const optTile = (selected: boolean) =>
		[
			'grid size-9 shrink-0 place-items-center rounded-xl',
			selected
				? 'bg-brand-500 text-white'
				: 'bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300'
		].join(' ');
	const chevronBtn =
		'grid size-9 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-ink-900 active:scale-95 motion-reduce:transition-none dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-white';
</script>

<svelte:head>
	<title>Tanulás | Leardy</title>
	<meta name="description" content="Tantárgyak, szintek és leckék böngészése." />
</svelte:head>

<div class="flex items-stretch {searchFocus ? 'gap-0' : 'gap-2'}">
	<div
		class="shrink-0 overflow-hidden transition-[width,opacity] duration-200 motion-reduce:transition-none"
		style:width={searchFocus ? '0px' : '46px'}
		style:opacity={searchFocus ? '0' : '1'}
	>
		<div class="grid h-full w-[46px] place-items-center">
			<IconButton
				ariaLabel="Tantárgy és szint: {activeSubject?.title ?? 'Választás'}, {activeLevelTitle}"
				size={46}
				disabled={searchFocus}
				onclick={openScope}
			>
				<ScopeIcon size={24} strokeWidth={1.75} />
			</IconButton>
		</div>
	</div>
	<SearchInput
		bind:value={query}
		placeholder="Keresés…"
		ariaLabel="Keresés a leckék között"
		onfocus={() => (searchFocus = true)}
		onblur={() => (searchFocus = false)}
	/>
	<div
		class="relative shrink-0 overflow-hidden transition-[width,opacity] duration-200 motion-reduce:transition-none"
		style:width={searchFocus ? '0px' : '46px'}
		style:opacity={searchFocus ? '0' : '1'}
	>
		<div class="grid h-full w-[46px] place-items-center">
			<IconButton
				ariaLabel="Szűrők és rendezés"
				size={46}
				disabled={searchFocus}
				onclick={() => (filterOpen = true)}
			>
				<SlidersHorizontal size={22} />
			</IconButton>
		</div>
		{#if activeFilterCount > 0}
			<span
				class="absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-brand-500 text-[10px] font-extrabold text-white"
				aria-hidden="true"
			>
				{activeFilterCount}
			</span>
		{/if}
	</div>
	<div
		class="shrink-0 overflow-hidden transition-[width,opacity] duration-200 motion-reduce:transition-none"
		style:width={searchFocus ? '0px' : '46px'}
		style:opacity={searchFocus ? '0' : '1'}
	>
		<div class="grid h-full w-[46px] place-items-center">
			<IconButton
				ariaLabel={lastLesson?.title ? `Folytatás: ${lastLesson.title}` : 'Folytatás: utolsó lecke megnyitása'}
				title={lastLesson?.title ? `Folytatás: ${lastLesson.title}` : 'Folytatás'}
				size={46}
				disabled={searchFocus}
				onclick={continueLastLesson}
			>
				<Play size={22} />
			</IconButton>
		</div>
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
	{:else if !treeQ.data || visibleLevels.length === 0}
		{#if treeQ.data && (query.trim() !== '' || status !== 'all')}
			<EmptyState
				title="Nincs találat"
				description="Próbálj másik keresést, vagy állíts a szűrőkön."
			/>
		{:else}
			<EmptyState
				title="Nincs tananyag"
				description="Ehhez a választáshoz most nincs megjeleníthető lecke."
			/>
		{/if}
	{:else}
		{@const singleLevel = levelId !== ''}
		<div class="grid gap-4">
			{#each visibleLevels as level (level.id)}
				<section aria-label={level.title}>
					{#if !singleLevel}
						<h2 class="font-display px-1 text-[17px] font-extrabold tracking-tight text-ink-900 dark:text-white">
							{level.title}
						</h2>
					{/if}
					<div class="{singleLevel ? '' : 'mt-2 '}grid gap-2.5">
						{#each level.materials as mat (mat.id)}
							{@const matOpen = isMatOpen(mat.id)}
							<Card>
								<div class="flex items-center gap-1.5">
									<p class="min-w-0 flex-1 text-[15px] font-extrabold text-ink-900 dark:text-white">{mat.title}</p>
									<IconButton
										ariaLabel="Véletlen kvíz: {mat.title}"
										title="Véletlen kvíz: {mat.title}"
										size={36}
										onclick={() => void playMaterial(mat.lessons.map((le) => le.id))}
									>
										<Dices size={16} />
									</IconButton>
									<button
										type="button"
										onclick={() => toggleMat(mat.id)}
										aria-expanded={matOpen}
										aria-label={matOpen ? `Témakör összecsukása: ${mat.title}` : `Témakör kinyitása: ${mat.title}`}
										class={chevronBtn}
									>
										<ChevronDown
											size={18}
											class={matOpen ? 'rotate-180 transition' : 'transition'}
											aria-hidden="true"
										/>
									</button>
								</div>
								{#if matOpen}
									<ul class="mt-1 divide-y divide-stone-100 dark:divide-white/5">
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
								{/if}
							</Card>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>

<Drawer
	open={scopeOpen}
	label="Tantárgy és szint választása"
	title={scopeStep === 'level' ? (pendingSubject?.title ?? 'Szint') : 'Tantárgy'}
	onBack={scopeStep === 'level' ? backToSubjects : undefined}
	onClose={closeScope}
	wide
>
	{#if scopeStep === 'subject'}
		<ul class="-mx-1 mt-2 space-y-0.5">
			{#if data.subjects.length === 0}
				<li>
					<p class="p-2 text-sm text-stone-500 dark:text-stone-400">Nincs megjeleníthető tantárgy.</p>
				</li>
			{:else}
				{#each data.subjects as s (s.id)}
					{@const SIcon = subjectIcons[s.icon] ?? Shapes}
					{@const selected = s.id === subjectId}
					<li>
						<button
							type="button"
							aria-pressed={selected}
							onclick={() => void goSubject(s.id)}
							class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
						>
							<span class={optTile(selected)}>
								<SIcon size={18} aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{s.title}</span>
								<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
									{s.lessonCount} lecke
								</span>
							</span>
							{#if selected}
								<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
							{:else}
								<ChevronRight size={17} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
							{/if}
						</button>
					</li>
				{/each}
			{/if}
		</ul>
	{:else}
		<ul class="-mx-1 mt-2 space-y-0.5">
			{#if pendingLoading}
				<li><p class="p-2 text-sm text-stone-500 dark:text-stone-400">Töltés…</p></li>
			{:else}
				{@const allSelected = pendingSubjectId === subjectId && levelId === ''}
				<li>
					<button
						type="button"
						aria-pressed={allSelected}
						onclick={() => pickLevel('')}
						class={[optRowBtn, allSelected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
					>
						<span class={optTile(allSelected)}>
							<Layers size={18} aria-hidden="true" />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
								Minden {pendingLevelLabelLow}
							</span>
							<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
								A teljes tantárgy
							</span>
						</span>
						{#if allSelected}
							<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
						{/if}
					</button>
				</li>
				{#if pendingLevels.length === 0}
					<li>
						<p class="p-2 text-sm text-stone-500 dark:text-stone-400">Nincs megjeleníthető szint.</p>
					</li>
				{:else}
					{#each pendingLevels as l (l.id)}
						{@const selected = pendingSubjectId === subjectId && l.id === levelId}
						<li>
							<button
								type="button"
								aria-pressed={selected}
								onclick={() => pickLevel(l.id)}
								class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
							>
								<span class={[optTile(selected), 'text-[15px] font-extrabold'].join(' ')}>
									{l.title.trim().charAt(0).toUpperCase()}
								</span>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{l.title}</span>
									<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
										{l.materials.length} témakör
									</span>
								</span>
								{#if selected}
									<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
								{/if}
							</button>
						</li>
					{/each}
				{/if}
			{/if}
		</ul>
	{/if}
</Drawer>

<Sheet open={filterOpen} label="Szűrők és rendezés" onClose={() => (filterOpen = false)}>
	<div class="mt-1 flex items-center gap-2">
		<h2 class="font-display min-w-0 flex-1 text-[20px] leading-snug font-extrabold tracking-tight text-ink-900 dark:text-white">
			Szűrők
		</h2>
		{#if activeFilterCount > 0}
			<IconButton ariaLabel="Szűrők törlése" tone="danger" size={40} onclick={resetFilters}>
				<Trash2 size={18} />
			</IconButton>
		{/if}
	</div>
	<div class="mt-2 grid gap-2">
		<button type="button" onclick={() => (fPicker = 'sort')} aria-haspopup="dialog" class={pickRowBtn}>
			<span class="min-w-0 flex-1">
				<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Rendezés</span>
				<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
					{sortTitle}
				</span>
			</span>
			<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
		</button>
	</div>

	<p class="mt-4 text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Állapot</p>
	<div
		role="group"
		aria-label="Állapot szűrő"
		class="mt-1 grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-white/10"
	>
		{#each [{ id: 'all', label: 'Mind' }, { id: 'done', label: 'Teljesített' }, { id: 'todo', label: 'Folyamatban' }] as o (o.id)}
			{@const selected = status === o.id}
			<button
				type="button"
				aria-pressed={selected}
				onclick={() => (status = o.id as typeof status)}
				class={[
					'rounded-xl px-2 py-2 text-[13px] leading-none transition active:scale-[0.97]',
					selected
						? 'bg-white font-extrabold text-ink-900 shadow-sm dark:bg-stone-800 dark:text-white dark:shadow-black/40'
						: 'font-semibold text-stone-500 hover:text-ink-900 dark:text-stone-400 dark:hover:text-white'
				]}
			>
				{o.label}
			</button>
		{/each}
	</div>
</Sheet>

<Sheet open={fPicker === 'sort'} label="Rendezés választása" title="Rendezés" onClose={() => (fPicker = null)}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		{#each sortOptions as o (o.id)}
			{@const Icon = o.icon}
			{@const selected = o.id === sortId}
			<li>
				<button
					type="button"
					aria-pressed={selected}
					onclick={() => {
						sortId = o.id;
						fPicker = null;
					}}
					class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={optTile(selected)}>
						<Icon size={18} aria-hidden="true" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{o.title}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">{o.desc}</span>
					</span>
					{#if selected}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

<QuickPractice questions={qpicks} open={qpOpen} onClose={() => (qpOpen = false)} />

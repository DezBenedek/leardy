<script lang="ts">
	import { createBackNavigation } from '$lib/back-navigation';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { ArrowDownAZ, ArrowLeft, BookOpenText, Check, ChevronDown, ChevronRight, Compass, Landmark, Languages, Layers, Leaf, Plus, Shapes, SlidersHorizontal, FunnelX } from '@lucide/svelte';
	interface DiscSortOption {
		id: string;
		title: string;
		desc: string;
		icon: typeof Compass;
	}
	import type { LevelNode, Package, Subject } from '$lib/curriculum';
	import { deckCardKindLabel } from '$lib/curriculum';
	import { normHu } from '$lib/deck-history';
	import { Query, getOrFetch, invalidate } from '$lib/query.svelte';
	import { loadScope, saveScope } from '$lib/scope';
	import { toast } from '$lib/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import SearchInput from '$lib/ui/SearchInput.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';

	/* Felfedezés: hivatalos kártyacsomagok böngészése és mentése a könyvtárba.
	   A hivatalos csomag leckénként egy készlet, a kvízektől független tárolásban.
	   A vissza-nyíl a szűrők mellett balra, cím nélkül. */

	/* Gyorstár-ablakok: friss = nincs hálózat, öreg = mutatható + csendben frissül. */
	const SUBJECTS_TTL = 30 * 60_000;
	const SUBJECTS_STALE = 2 * 3_600_000;
	const LEVELS_TTL = 15 * 60_000;
	const LEVELS_STALE = 3_600_000;
	const DISC_TTL = 5 * 60_000;
	const DISC_STALE = 15 * 60_000;
	const SAVED_TTL = 10 * 60_000;

	/* Saját kulcson jegyzi meg a szűrőket; első megnyitáskor a könyvtár
	   aktuális szűrőit örökli. */
	const ownScope = loadScope('kartyak-felfedezes');
	const savedScope = ownScope.subject ? ownScope : loadScope('kartyak');
	let subjectId = $state(savedScope.subject);
	let levelId = $state(savedScope.level);

	const subjectsQ = new Query<Subject[]>();
	const levelsQ = new Query<LevelNode[]>();
	const discQ = new Query<Package[]>();

	// Első paint előtti előtöltés: visszalépéskor rögtön adat, skeleton nélkül.
	untrack(() => {
		subjectsQ.prime('subjects', SUBJECTS_STALE);
		levelsQ.prime(subjectId ? `levels:${subjectId}` : null, LEVELS_STALE);
		discQ.prime(`disc-cards:${subjectId}:${levelId}`, DISC_STALE);
	});

	let subjects = $derived(subjectsQ.data ?? []);
	let levels = $derived(levelsQ.data ?? []);
	let discPackages = $derived(discQ.data ?? []);
	let savedIds = $state<Record<string, boolean>>({});

	/* Keresés + mentési szűrő + rendezés. A rendezést megjegyezzük. */
	const DISC_SORT_KEY = 'leardy-kartyak-discsort';

	function loadDiscSort(): string {
		if (typeof localStorage === 'undefined') return 'featured';
		const v = localStorage.getItem(DISC_SORT_KEY);
		return v === 'name' || v === 'cards' ? v : 'featured';
	}

	let query = $state('');
	let savedFilter: 'all' | 'new' | 'saved' = $state('all');
	let sortId = $state(loadDiscSort());

	const discSortOptions: DiscSortOption[] = [
		{ id: 'featured', title: 'Ajánlott sorrend', desc: 'A felfedezés eredeti sorrendje', icon: Compass },
		{ id: 'name', title: 'Név szerint', desc: 'A-tól Z-ig', icon: ArrowDownAZ },
		{ id: 'cards', title: 'Kártyaszám szerint', desc: 'A legtöbb kártya elöl', icon: Layers }
	];

	let filterOpen = $state(false);
	/** Fókuszban a kereső: a sor gombjai összehúzódnak, a mező szélesre nyílik. */
	let searchFocus = $state(false);
	let fPicker = $state<'subject' | 'level' | 'sort' | null>(null);

	const subjectIcons: Record<string, typeof Landmark> = {
		landmark: Landmark,
		leaf: Leaf,
		languages: Languages,
		book: BookOpenText
	};

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

	let filterSubjectTitle = $derived(
		subjectId ? (subjects.find((s) => s.id === subjectId)?.title ?? 'Összes') : 'Összes'
	);
	let filterLevelLabel = $derived(subjects.find((s) => s.id === subjectId)?.levelLabel || 'Szint');
	let filterLevelTitle = $derived(
		levelId ? (levels.find((l) => l.id === levelId)?.title ?? 'Mindegyik') : 'Mindegyik'
	);
	let filterSortTitle = $derived(discSortOptions.find((o) => o.id === sortId)?.title ?? 'Rendezés');

	/** Aktív szűrők száma a szűrőgomb jelvényéhez (az Összes tantárgy az alap). */
	let activeFilterCount = $derived(
		(levelId ? 1 : 0) + (savedFilter !== 'all' ? 1 : 0) + (sortId !== 'featured' ? 1 : 0)
	);

	function resetFilters() {
		levelId = '';
		savedFilter = 'all';
		sortId = 'featured';
	}

	let shown = $derived.by(() => {
		const q = normHu(query.trim());
		const list = discPackages.filter((p) => {
			if (savedFilter === 'new' && savedIds[p.quizId]) return false;
			if (savedFilter === 'saved' && !savedIds[p.quizId]) return false;
			if (!q) return true;
			const hay = normHu(
				[p.title, p.subjectTitle, p.levelTitle, p.lessonTitle, p.materialTitle]
					.filter(Boolean)
					.join(' ')
			);
			return hay.includes(q);
		});
		if (sortId === 'name') list.sort((a, b) => a.title.localeCompare(b.title, 'hu'));
		else if (sortId === 'cards')
			list.sort((a, b) => b.questionCount - a.questionCount || a.title.localeCompare(b.title, 'hu'));
		return list;
	});

	let searchActive = $derived(query.trim() !== '' || savedFilter !== 'all');

	async function fetchLevelsRaw(id: string): Promise<LevelNode[]> {
		try {
			const res = await fetch(`/api/browse?subject=${encodeURIComponent(id)}`);
			const j = await res.json();
			return res.ok && j.tree ? (j.tree.levels ?? []) : [];
		} catch {
			return [];
		}
	}

	async function fetchSubjectsRaw(): Promise<Subject[]> {
		try {
			const res = await fetch('/api/browse');
			const j = await res.json();
			return res.ok ? (j.subjects ?? []) : [];
		} catch {
			return [];
		}
	}

	async function fetchDiscRaw(sub: string, lev: string): Promise<Package[]> {
		try {
			const params = new URLSearchParams();
			params.set('scope', 'cards');
			if (sub) params.set('subject', sub);
			if (lev) params.set('level', lev);
			const res = await fetch(`/api/packages?${params}`);
			const j = await res.json();
			return res.ok ? (j.packages ?? []) : [];
		} catch {
			return [];
		}
	}

	async function fetchSavedIdsRaw(): Promise<Record<string, boolean>> {
		try {
			const res = await fetch('/api/library?ids=1');
			const j = await res.json();
			const ids: Record<string, boolean> = {};
			if (res.ok) for (const id of j.ids ?? []) ids[id] = true;
			return ids;
		} catch {
			throw new Error('net');
		}
	}

	async function fetchSavedIds() {
		try {
			savedIds = await getOrFetch('library:ids', fetchSavedIdsRaw, SAVED_TTL);
		} catch {
			// néma hiba: marad az előző állapot
		}
	}

	/* Leírás sor: ami szűrőként ki van választva (tantárgy/szint), az nem
	   ismétlődik minden sorban; a lecke sem, ha a cím már tartalmazza
	   (a hivatalos csomag címe `{leckecím} – kártyák`). */
	function describe(p: Package): string {
		const parts: string[] = [];
		if (p.subjectTitle && !(subjectId && p.subjectId === subjectId)) parts.push(p.subjectTitle);
		if (p.levelTitle && !(levelId && p.levelId === levelId)) parts.push(p.levelTitle);
		if (p.lessonTitle && !p.title.startsWith(p.lessonTitle)) parts.push(p.lessonTitle);
		parts.push(deckCardKindLabel(p.cardKind));
		parts.push(`${p.questionCount} kártya`);
		return parts.join(' · ');
	}
	async function addToLibrary(pkg: Package) {
		try {
			const res = await fetch('/api/library', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ quizId: pkg.quizId })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(j.error ?? 'Hiba történt.');
			savedIds = { ...savedIds, [pkg.quizId]: true };
			invalidate('library:ids');
			invalidate('library');
			toast.success('Könyvtárba mentve!', 'Offline is megnyithatod majd.');
		} catch (e) {
			toast.error('Nem sikerült menteni', e instanceof Error ? e.message : 'Hiba történt.');
		}
	}

	async function removeFromLibrary(pkg: Package) {
		try {
			const res = await fetch('/api/library', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ quizId: pkg.quizId })
			});
			if (!res.ok) throw new Error('Hiba történt.');
			const next = { ...savedIds };
			delete next[pkg.quizId];
			savedIds = next;
			invalidate('library:ids');
			invalidate('library');
			toast.success('Eltávolítva a könyvtárból.');
		} catch (e) {
			toast.error('Nem sikerült eltávolítani', e instanceof Error ? e.message : 'Hiba történt.');
		}
	}

	const goBack = createBackNavigation(() => resolve('/kartyak'), { direct: true });

	/* A részletező vissza-nyila ide tér vissza, ha innen nyitották meg. */
	function markFromDiscovery() {
		try {
			sessionStorage.setItem('kartyak-detail-back', '/kartyak/felfedezes');
		} catch {
			// tiltott storage
		}
	}

	$effect(() => {
		subjectsQ.load('subjects', fetchSubjectsRaw, SUBJECTS_TTL, SUBJECTS_STALE);
		void fetchSavedIds();
	});

	$effect(() => {
		const list = subjectsQ.data;
		if (!list) return;
		// Érvénytelen mentett szűrő visszaáll Összesre; üres a megengedett alap.
		if (subjectId && !list.some((s) => s.id === subjectId)) {
			subjectId = '';
		}
	});

	let prevSubject = $state<string | null>(null);

	$effect(() => {
		const id = subjectId;
		if (prevSubject !== null && prevSubject !== id) levelId = '';
		prevSubject = id;
		if (!id) {
			levelId = '';
			levelsQ.load(null, () => Promise.resolve([]), LEVELS_TTL, LEVELS_STALE);
			return;
		}
		levelsQ.load(id ? `levels:${id}` : null, () => fetchLevelsRaw(id), LEVELS_TTL, LEVELS_STALE);
	});

	$effect(() => {
		const ls = levelsQ.data;
		if (ls && levelId && !ls.some((l) => l.id === levelId)) levelId = '';
	});

	// Utolsó választás mentése.
	$effect(() => {
		saveScope('kartyak-felfedezes', { subject: subjectId, level: levelId });
	});
	$effect(() => {
		try {
			localStorage.setItem(DISC_SORT_KEY, sortId);
		} catch {
			// tiltott storage
		}
	});

	$effect(() => {
		const sub = subjectId;
		const lev = levelId;
		discQ.load(`disc-cards:${sub}:${lev}`, () => fetchDiscRaw(sub, lev), DISC_TTL, DISC_STALE);
	});
</script>

<svelte:head>
	<title>Felfedezés | Leardy</title>
	<meta name="description" content="Hivatalos kártyacsomagok böngészése és mentése a könyvtárba." />
</svelte:head>

<div class="flex items-stretch {searchFocus ? 'gap-0' : 'gap-2'}">
	<div
		class="shrink-0 overflow-hidden transition-[width,opacity] duration-200 motion-reduce:transition-none"
		style:width={searchFocus ? '0px' : '46px'}
		style:opacity={searchFocus ? '0' : '1'}
	>
		<div class="grid h-full w-[46px] place-items-center">
			<IconButton ariaLabel="Vissza a könyvtárba" size={46} disabled={searchFocus} onclick={goBack}>
				<ArrowLeft size={22} />
			</IconButton>
		</div>
	</div>
	<SearchInput
		bind:value={query}
		placeholder="Keresés cím alapján…"
		ariaLabel="Keresés a felfedezésben"
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
</div>

<div class="mt-4">
	{#if discQ.loading}
		<div role="status" aria-label="Betöltés" class="grid gap-2">
			{#each [0, 1, 2, 3] as i (i)}
				<div class="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 dark:border-white/10 dark:bg-stone-900">
					<Skeleton cls="size-9 shrink-0 rounded-xl" />
					<div class="min-w-0 flex-1 space-y-1.5">
						<Skeleton cls="h-4 w-3/4 rounded-md" />
						<Skeleton cls="h-3 w-1/2 rounded-md" />
					</div>
					<Skeleton cls="size-9 shrink-0 rounded-full" />
				</div>
			{/each}
			<span class="sr-only">Betöltés…</span>
		</div>
	{:else if shown.length === 0 && searchActive && discPackages.length > 0}
		<EmptyState
			title="Nincs találat"
			description="Próbálj másik keresést, vagy állíts a szűrőkön."
		/>
	{:else if shown.length === 0}
		<EmptyState
			title="Nincs találat"
			description="Ehhez a szűréshez most nincs hivatalos kártyacsomag."
		/>
	{:else}
		<p class="mb-2 text-[12px] font-bold text-stone-400 tabular-nums dark:text-stone-500">
			{shown.length} csomag
		</p>
		<div class="grid gap-2">
			{#each shown as pkg (pkg.quizId)}
				<div
					class="flex items-center gap-3 overflow-hidden rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 dark:border-white/10 dark:bg-stone-900"
				>
					<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300" aria-hidden="true">
						<Layers size={18} />
					</span>
					<a
						href="/kartyak/{encodeURIComponent(pkg.quizId)}"
						onclick={markFromDiscovery}
						class="min-w-0 flex-1 text-left"
						aria-label="Megnyitás: {pkg.title}"
					>
						<span class="font-display line-clamp-2 text-[15px] leading-snug font-extrabold text-ink-900 dark:text-white">
							{pkg.title}
						</span>
						<span class="mt-0.5 block truncate text-[12px] font-medium text-stone-500 dark:text-stone-400">
							{describe(pkg)}
						</span>
					</a>
					{#if savedIds[pkg.quizId]}
						<button
							type="button"
							onclick={() => void removeFromLibrary(pkg)}
							aria-label="Eltávolítás a könyvtárból: {pkg.title}"
							title="Könyvtárban van, koppints az eltávolításhoz"
							class="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 transition hover:bg-emerald-500/25 active:scale-95 dark:text-emerald-300"
						>
							<Check size={18} strokeWidth={3} />
						</button>
					{:else}
						<button
							type="button"
							onclick={() => void addToLibrary(pkg)}
							aria-label="Mentés a könyvtárba: {pkg.title}"
							title="Mentés a könyvtárba"
							class="grid size-9 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 active:scale-95"
						>
							<Plus size={18} />
						</button>
					{/if}
					<a
						href="/kartyak/{encodeURIComponent(pkg.quizId)}"
						onclick={markFromDiscovery}
						aria-label="Megnyitás: {pkg.title}"
						title="Megnyitás"
						class="grid size-9 shrink-0 place-items-center rounded-full text-stone-300 transition hover:bg-stone-100 hover:text-brand-500 active:scale-95 dark:text-stone-600 dark:hover:bg-white/10 dark:hover:text-brand-300"
					>
						<ChevronRight size={19} aria-hidden="true" />
					</a>
				</div>
			{/each}
		</div>
	{/if}
</div>

<Sheet open={filterOpen} label="Szűrők és rendezés" onClose={() => (filterOpen = false)}>
	<div class="mt-1 flex items-center gap-2">
		<h2 class="font-display min-w-0 flex-1 text-[20px] leading-snug font-extrabold tracking-tight text-ink-900 dark:text-white">
			Szűrők
		</h2>
		{#if activeFilterCount > 0}
			<Button variant="outline" size="sm" onclick={resetFilters}>
				<FunnelX size={16} aria-hidden="true" /> Szűrők törlése
			</Button>
		{/if}
	</div>
	<div class="mt-2 grid gap-2">
		<button type="button" onclick={() => (fPicker = 'subject')} aria-haspopup="dialog" class={pickRowBtn}>
			<span class="min-w-0 flex-1">
				<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Tantárgy</span>
				<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
					{filterSubjectTitle}
				</span>
			</span>
			<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
		</button>
		<button type="button" onclick={() => (fPicker = 'level')} disabled={!subjectId} aria-haspopup="dialog" class={pickRowBtn}>
			<span class="min-w-0 flex-1">
				<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">{subjectId ? filterLevelLabel : 'Szint'}</span>
				<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
					{subjectId ? filterLevelTitle : 'Előbb válassz tantárgyat'}
				</span>
			</span>
			<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
		</button>
		<button type="button" onclick={() => (fPicker = 'sort')} aria-haspopup="dialog" class={pickRowBtn}>
			<span class="min-w-0 flex-1">
				<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Rendezés</span>
				<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
					{filterSortTitle}
				</span>
			</span>
			<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
		</button>
	</div>

	<p class="mt-4 text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Mentés</p>
	<div
		role="group"
		aria-label="Mentési szűrő"
		class="mt-1 grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-white/10"
	>
		{#each [{ id: 'all', label: 'Mind' }, { id: 'new', label: 'Még nem mentett' }, { id: 'saved', label: 'Könyvtárban' }] as o (o.id)}
			{@const selected = savedFilter === o.id}
			<button
				type="button"
				aria-pressed={selected}
				onclick={() => (savedFilter = o.id as typeof savedFilter)}
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

<Sheet open={fPicker === 'subject'} label="Tantárgy választása" title="Tantárgy" onClose={() => (fPicker = null)}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		<li>
			<button
				type="button"
				aria-pressed={subjectId === ''}
				onclick={() => {
					subjectId = '';
					fPicker = null;
				}}
				class={[optRowBtn, subjectId === '' ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={optTile(subjectId === '')}><Shapes size={18} aria-hidden="true" /></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Összes</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Minden tantárgy csomagjai</span>
				</span>
				{#if subjectId === ''}
					<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
				{/if}
			</button>
		</li>
		{#each subjects as s (s.id)}
			{@const SIcon = subjectIcons[s.icon] ?? Shapes}
			{@const selected = s.id === subjectId}
			<li>
				<button
					type="button"
					aria-pressed={selected}
					onclick={() => {
						subjectId = s.id;
						fPicker = null;
					}}
					class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={optTile(selected)}><SIcon size={18} aria-hidden="true" /></span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{s.title}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">{s.packCount} csomag</span>
					</span>
					{#if selected}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

<Sheet open={fPicker === 'level'} label="{filterLevelLabel} választása" title={filterLevelLabel} onClose={() => (fPicker = null)}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		<li>
			<button
				type="button"
				aria-pressed={levelId === ''}
				onclick={() => {
					levelId = '';
					fPicker = null;
				}}
				class={[optRowBtn, levelId === '' ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={optTile(levelId === '')}><Layers size={18} aria-hidden="true" /></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Mindegyik</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">A teljes tantárgy</span>
				</span>
				{#if levelId === ''}
					<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
				{/if}
			</button>
		</li>
		{#each levels as l (l.id)}
			{@const selected = l.id === levelId}
			<li>
				<button
					type="button"
					aria-pressed={selected}
					onclick={() => {
						levelId = selected ? '' : l.id;
						fPicker = null;
					}}
					class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={[optTile(selected), 'text-[15px] font-extrabold'].join(' ')}>
						{l.title.trim().charAt(0).toUpperCase()}
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{l.title}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">{l.materials.length} tananyag</span>
					</span>
					{#if selected}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

<Sheet open={fPicker === 'sort'} label="Rendezés választása" title="Rendezés" onClose={() => (fPicker = null)}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		{#each discSortOptions as o (o.id)}
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

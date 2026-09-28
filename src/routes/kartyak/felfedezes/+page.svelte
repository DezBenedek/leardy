<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { ArrowLeft, Check, ChevronRight, Layers, Plus } from '@lucide/svelte';
	import ScopePickers from '$lib/components/ScopePickers.svelte';
	import type { LevelNode, Package, Subject } from '$lib/curriculum';
	import { Query, getOrFetch, invalidate } from '$lib/query.svelte';
	import { loadScope, saveScope } from '$lib/scope';
	import { toast } from '$lib/toast.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
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

	function goBack() {
		if (typeof history !== 'undefined' && history.length > 1) history.back();
		else void goto('/kartyak');
	}

	$effect(() => {
		subjectsQ.load('subjects', fetchSubjectsRaw, SUBJECTS_TTL, SUBJECTS_STALE);
		void fetchSavedIds();
	});

	$effect(() => {
		const list = subjectsQ.data;
		if (!list) return;
		if (!subjectId || !list.some((s) => s.id === subjectId)) {
			subjectId = list[0]?.id ?? '';
		}
	});

	let prevSubject = $state<string | null>(null);

	$effect(() => {
		const id = subjectId;
		if (prevSubject !== null && prevSubject !== id) levelId = '';
		prevSubject = id;
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
		const sub = subjectId;
		const lev = levelId;
		discQ.load(`disc-cards:${sub}:${lev}`, () => fetchDiscRaw(sub, lev), DISC_TTL, DISC_STALE);
	});
</script>

<svelte:head>
	<title>Felfedezés | Leardy</title>
	<meta name="description" content="Hivatalos kártyacsomagok böngészése és mentése a könyvtárba." />
</svelte:head>

<div class="flex items-stretch gap-2">
	<div class="grid shrink-0 place-items-center">
		<IconButton ariaLabel="Vissza a könyvtárba" size={46} onclick={goBack}>
			<ArrowLeft size={22} />
		</IconButton>
	</div>
	<ScopePickers {subjects} {levels} bind:subjectId bind:levelId />
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
	{:else if discPackages.length === 0}
		<EmptyState
			title="Nincs találat"
			description="Ehhez a szűréshez most nincs hivatalos kártyacsomag."
		/>
	{:else}
		<div class="grid gap-2">
			{#each discPackages as pkg (pkg.quizId)}
				<div
					class="flex items-center gap-3 overflow-hidden rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 dark:border-white/10 dark:bg-stone-900"
				>
					<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300" aria-hidden="true">
						<Layers size={18} />
					</span>
					<a
						href="/kartyak/{encodeURIComponent(pkg.quizId)}"
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
					<ChevronRight size={17} class="hidden shrink-0 text-stone-300 sm:block dark:text-stone-600" aria-hidden="true" />
				</div>
			{/each}
		</div>
	{/if}
</div>

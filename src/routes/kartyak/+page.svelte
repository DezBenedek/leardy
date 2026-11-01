<script lang="ts">
	import { getTutorial } from '$lib/tutorial/controller.svelte';
	import { mutationFetch } from '$lib/platform/mutation-fetch';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import {
		Plus,
		SlidersHorizontal
	} from '@lucide/svelte';
	import type { LevelNode, Package, Subject } from '$lib/curriculum/curriculum';
	import { loadDeckOpened, normHu } from '$lib/deck/deck-history';
	import { Query, getOrFetch } from '$lib/state/query.svelte';
	import { loadScope, saveScope } from '$lib/platform/scope';
	import { toast } from '$lib/state/toast.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import SearchInput from '$lib/ui/SearchInput.svelte';
	import AddSheet from './AddSheet.svelte';
	import DeckPickerSheets from './DeckPickerSheets.svelte';
	import DeckSheet from './DeckSheet.svelte';
	import FilterPickerSheets from './FilterPickerSheets.svelte';
	import FilterSheet from './FilterSheet.svelte';
	import LibraryList from './LibraryList.svelte';
	import { fetchLevelsRaw, fetchLibraryRaw, fetchSubjectsRaw } from './library-api';
	import { describe, LIB_SORT_KEY, loadLibSort, markFromLibrary, pkgHaystack } from './library-format';
	import { dLevelLabel, filterLevelLabel, libSortOptions } from './library-ui';

	const tutorial = getTutorial();
	/* Könyvtár: csak a saját kártyacsomagok. A kvízek nem részei a Kártyák
	   területnek: a kvíz a lecke oldalán él, a kártya külön csomagként,
	   opcionálisan leckéhez csatolva. */

	/* A memóriában őrzött adat azonnal látszik, megnyitáskor újraellenőrizzük. */
	const SUBJECTS_TTL = 30 * 60_000;
	const SUBJECTS_STALE = 2 * 3_600_000;
	const LEVELS_TTL = 15 * 60_000;
	const LEVELS_STALE = 3_600_000;
	const LIB_TTL = 10 * 60_000;
	const LIB_STALE = 30 * 60_000;

	const savedScope = loadScope('kartyak');
	let subjectId = $state(savedScope.subject);
	let levelId = $state(savedScope.level);

	const subjectsQ = new Query<Subject[]>();
	const levelsQ = new Query<LevelNode[]>();
	const libraryQ = new Query<Package[]>();

	// Első paint előtti előtöltés: visszalépéskor rögtön adat, skeleton nélkül.
	untrack(() => {
		subjectsQ.prime('subjects', SUBJECTS_STALE);
		levelsQ.prime(subjectId ? `levels:${subjectId}` : null, LEVELS_STALE);
		libraryQ.prime('library', LIB_STALE);
	});

	let subjects = $derived(subjectsQ.data ?? []);
	let levels = $derived(levelsQ.data ?? []);
	let library = $derived(libraryQ.data ?? []);
	let loading = $derived(libraryQ.loading);

	/** A lenyílókban csak olyan tantárgy/tananyag szerepel, amihez van könyvtári csomag. */
	let libSubjects = $derived(subjects.filter((s) => library.some((p) => p.subjectId === s.id)));
	let libLevels = $derived(
		levels.filter((l) =>
			library.some((p) => p.levelId === l.id && (!p.subjectId || p.subjectId === subjectId))
		)
	);

	/* Keresés + eredet-szűrő + rendezés. A rendezést megjegyezzük. */

	let query = $state('');
	let origin: 'all' | 'mine' | 'saved' = $state('all');
	let sortId = $state(loadLibSort());
	let filterOpen = $state(false);
	let addOpen = $state(false);
	$effect(() => tutorial?.register('cards', {
		prepare(step) { addOpen = step.id === 'cards-discover'; searchFocus = false; },
		close() { addOpen = false; }
	}));
	/** Fókuszban a kereső: a sor gombjai összehúzódnak, a mező szélesre nyílik. */
	let searchFocus = $state(false);
	let fPicker = $state<'subject' | 'level' | 'sort' | null>(null);

	let filterSubjectTitle = $derived(
		subjectId ? (libSubjects.find((s) => s.id === subjectId)?.title ?? 'Összes') : 'Összes'
	);
	let filterLevelTitle = $derived(
		levelId ? (libLevels.find((l) => l.id === levelId)?.title ?? 'Mindegyik') : 'Mindegyik'
	);
	let filterSortTitle = $derived(libSortOptions.find((o) => o.id === sortId)?.title ?? 'Rendezés');

	/** Aktív szűrők száma a szűrőgomb jelvényéhez. */
	let activeFilterCount = $derived(
		(subjectId ? 1 : 0) + (levelId ? 1 : 0) + (origin !== 'all' ? 1 : 0) + (sortId !== 'recent' ? 1 : 0)
	);

	/** Csomagszám tantárgyanként és tananyagonként a szűrő-drawer felirataihoz. */
	let libCountBySubject = $derived.by(() => {
		const m = new Map<string, number>();
		for (const p of library) {
			if (!p.subjectId) continue;
			m.set(p.subjectId, (m.get(p.subjectId) ?? 0) + 1);
		}
		return m;
	});
	let libCountByLevel = $derived.by(() => {
		const m = new Map<string, number>();
		for (const p of library) {
			if (!p.levelId) continue;
			m.set(p.levelId, (m.get(p.levelId) ?? 0) + 1);
		}
		return m;
	});

	function resetFilters() {
		subjectId = '';
		levelId = '';
		origin = 'all';
		sortId = 'recent';
	}

	/** Szűrés a könyvtárra; a besorolatlan saját csomag mindig látszik, hogy el ne vesszen. */
	let filtered = $derived(
		library.filter((p) => {
			if (origin === 'mine' && !p.mine) return false;
			if (origin === 'saved' && p.mine) return false;
			const q = normHu(query.trim());
			if (q && !pkgHaystack(p).includes(q)) return false;
			if (p.mine && !p.subjectId) return true;
			if (subjectId && p.subjectId !== subjectId) return false;
			if (levelId && p.levelId !== levelId) return false;
			return true;
		})
	);

	let visible = $derived.by(() => {
		const list = [...filtered];
		if (sortId === 'name') {
			list.sort((a, b) => a.title.localeCompare(b.title, 'hu'));
		} else if (sortId === 'cards') {
			list.sort((a, b) => b.questionCount - a.questionCount || a.title.localeCompare(b.title, 'hu'));
		} else {
			const opened = loadDeckOpened();
			list.sort((a, b) => {
				const ta = opened[a.quizId] ?? 0;
				const tb = opened[b.quizId] ?? 0;
				if (ta !== tb) return tb - ta;
				return a.title.localeCompare(b.title, 'hu');
			});
		}
		return list;
	});

	// Nézet + új csomag
	let deckOpen = $state(false);
	let picker = $state<'subject' | 'level' | null>(null);
	let dTitle = $state('');
	let dSubject = $state('');
	let dLevel = $state('');
	let dLevels = $state<LevelNode[]>([]);
	let dBusy = $state(false);
	let lastDeckSubject = $state('');
	/** Automatikus típus a választott tantárgy alapján: nyelvnél Szókártya, máshol Tanulókártya. */

	let dSubjectTitle = $derived(subjects.find((s) => s.id === dSubject)?.title ?? '');
	let dLevelTitle = $derived(dLevels.find((l) => l.id === dLevel)?.title ?? '');
	let dLevelLabelLow = $derived(dLevelLabel.toLowerCase());

	async function fetchDeckLevels(id: string) {
		if (!id) {
			dLevels = [];
			return;
		}
		try {
			dLevels = await getOrFetch(`levels:${id}`, (cached) => fetchLevelsRaw(id, cached), 5 * 60_000, 0, true);
		} catch {
			dLevels = [];
		}
	}

	function openDeckSheet() {
		dTitle = '';
		dSubject = subjectId;
		lastDeckSubject = subjectId;
		dLevel = '';
		dBusy = false;
		picker = null;
		void fetchDeckLevels(subjectId);
		deckOpen = true;
	}

	function onDSubject(v: string) {
		dSubject = v;
		dLevel = '';
		picker = null;
	}

	function onDLevel(v: string) {
		dLevel = v;
		picker = null;
	}

	$effect(() => {
		if (!deckOpen) return;
		if (dSubject !== lastDeckSubject) {
			lastDeckSubject = dSubject;
			dLevel = '';
			void fetchDeckLevels(dSubject);
		}
	});

	async function saveDeck() {
		if (!dTitle.trim()) {
			toast.warning('Hiányzik a cím', 'Add meg a csomag címét!');
			return;
		}
		if (dBusy) return;
		dBusy = true;
		try {
			const res = await mutationFetch('/api/decks', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: dTitle.trim(),
					kind: 'cards',
					subjectId: dSubject || undefined,
					levelId: dLevel || undefined
				})
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(j.error ?? 'Hiba történt.');
			toast.success('Csomag létrehozva!', 'Vedd fel a kártyákat a szerkesztőben.');
			deckOpen = false;
			libraryQ.touch();
			markFromLibrary();
			void goto(`/kartyak/${encodeURIComponent(`deck:${j.id}`)}`);
		} catch (e) {
			toast.error('Nem sikerült létrehozni', e instanceof Error ? e.message : 'Hiba történt.');
		} finally {
			dBusy = false;
		}
	}

	$effect(() => {
		subjectsQ.load('subjects', fetchSubjectsRaw, SUBJECTS_TTL, SUBJECTS_STALE);
	});

	// Mentett tantárgy érvényesítése: üres = Összes, érvénytelen visszaáll Összesre.
	$effect(() => {
		if (!subjectsQ.data || !libraryQ.data) return;
		if (subjectId && !libSubjects.some((s) => s.id === subjectId)) {
			subjectId = '';
		}
	});

	// Visszatöltött tananyagot az első betöltés nem nullázza, váltáskor igen.
	let prevSubject = $state<string | null>(null);

	$effect(() => {
		const id = subjectId;
		if (prevSubject !== null && prevSubject !== id) levelId = '';
		prevSubject = id;
		levelsQ.load(id ? `levels:${id}` : null, (cached) => fetchLevelsRaw(id, cached), LEVELS_TTL, LEVELS_STALE);
	});

	// Mentett tananyag érvényesítése (csak kártyás tananyag maradhat).
	$effect(() => {
		if (!libraryQ.data) return;
		if (levelId && !libLevels.some((l) => l.id === levelId)) levelId = '';
	});

	$effect(() => {
		libraryQ.load('library', fetchLibraryRaw, LIB_TTL, LIB_STALE);
	});

	// Utolsó választás mentése.
	$effect(() => {
		saveScope('kartyak', { subject: subjectId, level: levelId });
	});
	$effect(() => {
		try {
			localStorage.setItem(LIB_SORT_KEY, sortId);
		} catch {
			// tiltott storage
		}
	});
</script>

<svelte:head>
	<title>Kártyák | Leardy</title>
	<meta name="description" content="Saját kártyakönyvtár gyakorláshoz." />
</svelte:head>

<div class="flex items-stretch {searchFocus ? 'gap-0' : 'gap-2'}">
	<SearchInput
		bind:value={query}
		placeholder="Keresés cím alapján…"
		ariaLabel="Keresés a könyvtárban"
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
				ariaLabel="Hozzáadás: felfedezés vagy létrehozás"
				size={46}
				disabled={searchFocus}
				tutorialId="cards-add" onclick={() => { addOpen = true; tutorial?.signal('cards-add'); }}
			>
				<Plus size={22} />
			</IconButton>
		</div>
	</div>
</div>

<LibraryList
	loading={loading}
	libraryEmpty={library.length === 0}
	{visible}
	describe={(p) => describe(p, subjectId, levelId)}
	onNavigate={markFromLibrary}
/>

<AddSheet
	open={addOpen}
	onClose={() => (addOpen = false)}
	onDiscover={() => {
		addOpen = false;
		void goto('/kartyak/felfedezes');
	}}
	onCreate={() => {
		addOpen = false;
		openDeckSheet();
	}}
/>

<FilterSheet
	open={filterOpen}
	onClose={() => (filterOpen = false)}
	{filterSubjectTitle}
	{filterLevelLabel}
	{filterLevelTitle}
	{filterSortTitle}
	{activeFilterCount}
	{origin}
	onPickSubject={() => (fPicker = 'subject')}
	onPickLevel={() => (fPicker = 'level')}
	onPickSort={() => (fPicker = 'sort')}
	onOrigin={(v) => (origin = v)}
	onReset={resetFilters}
/>

<FilterPickerSheets
	{fPicker}
	onClose={() => (fPicker = null)}
	{subjectId}
	{levelId}
	{sortId}
	{libSubjects}
	{libLevels}
	{libCountBySubject}
	{libCountByLevel}
	{filterLevelLabel}
	onSelectSubject={(v) => {
		subjectId = v;
		fPicker = null;
	}}
	onSelectLevel={(v) => {
		levelId = v;
		fPicker = null;
	}}
	onSelectSort={(v) => {
		sortId = v;
		fPicker = null;
	}}
/>

<DeckSheet
	open={deckOpen}
	onClose={() => (deckOpen = false)}
	bind:dTitle
	{dSubjectTitle}
	{dLevelLabel}
	{dLevelTitle}
	{dSubject}
	{dBusy}
	onPickSubject={() => (picker = 'subject')}
	onPickLevel={() => (picker = 'level')}
	onSave={saveDeck}
/>

<DeckPickerSheets
	{picker}
	onClose={() => (picker = null)}
	{dSubject}
	{dLevel}
	{subjects}
	{dLevels}
	{dLevelLabel}
	{dLevelLabelLow}
	onSubject={onDSubject}
	onLevel={onDLevel}
/>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import {
		BookOpenText,
		Check,
		ChevronDown,
		ChevronRight,
		Compass,
		Landmark,
		Languages,
		Layers,
		Leaf,
		Plus,
		Shapes
	} from '@lucide/svelte';
	import ScopePickers from '$lib/components/ScopePickers.svelte';
	import type { LevelNode, Package, Subject } from '$lib/curriculum';
	import { Query, getOrFetch } from '$lib/query.svelte';
	import { loadScope, saveScope } from '$lib/scope';
	import { toast } from '$lib/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';

	/* Könyvtár: csak a saját kártyacsomagok. A kvízek nem részei a Kártyák
	   területnek: a kvíz a lecke oldalán él, a kártya külön csomagként,
	   opcionálisan leckéhez csatolva. */

	const LIB_CACHE = 'leardy-library';
	/** A kézi könyvtár-gyorstár lejárata: eddig időbélyeg nélkül, örökké élt. */
	const LIB_CACHE_MS = 24 * 3_600_000;

	/* Gyorstár-ablakok: friss = nincs hálózat, öreg = mutatható + csendben frissül. */
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
	/** Az új csomag űrlapján a szint-címke a választott tantárgytól függ. */
	let dLevelLabel = $derived(subjects.find((s) => s.id === dSubject)?.levelLabel || 'Szint');
	let offline = $state(false);

	/** A lenyílókban csak olyan tantárgy/szint szerepel, amihez van könyvtári csomag. */
	let libSubjects = $derived(subjects.filter((s) => library.some((p) => p.subjectId === s.id)));
	let libLevels = $derived(
		levels.filter((l) =>
			library.some((p) => p.levelId === l.id && (!p.subjectId || p.subjectId === subjectId))
		)
	);

	/** Szűrés a könyvtárra; a besorolatlan saját csomag mindig látszik, hogy el ne vesszen. */
	let visible = $derived(
		library.filter((p) => {
			if (p.mine && !p.subjectId) return true;
			if (subjectId && p.subjectId !== subjectId) return false;
			if (levelId && p.levelId !== levelId) return false;
			return true;
		})
	);

	/** Leírás sor: ami szűrőként ki van választva (tantárgy/szint), az nem
	   ismétlődik minden sorban; a csatolt lecke sem, ha a cím már tartalmazza. */
	function describe(p: Package): string {
		if (!p.subjectId) return `Besorolatlan saját csomag · ${p.questionCount} kártya`;
		const parts: string[] = [];
		if (p.subjectTitle && !(subjectId && p.subjectId === subjectId)) parts.push(p.subjectTitle);
		if (p.levelTitle && !(levelId && p.levelId === levelId)) parts.push(p.levelTitle);
		if (p.attachedLessonTitle && !p.title.startsWith(p.attachedLessonTitle))
			parts.push(p.attachedLessonTitle);
		parts.push(`${p.questionCount} kártya`);
		return parts.join(' · ');
	}

	// Nézet + új csomag
	let deckOpen = $state(false);
	let picker = $state<'subject' | 'level' | null>(null);
	let dTitle = $state('');
	let dSubject = $state('');
	let dLevel = $state('');
	let dLevels = $state<LevelNode[]>([]);
	let dBusy = $state(false);
	let lastDeckSubject = $state('');

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

	let dSubjectTitle = $derived(subjects.find((s) => s.id === dSubject)?.title ?? '');
	let dLevelTitle = $derived(dLevels.find((l) => l.id === dLevel)?.title ?? '');
	let dLevelLabelLow = $derived(dLevelLabel.toLowerCase());

	const cardInput =
		'min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 motion-reduce:transition-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500';

	async function fetchLevelsRaw(id: string): Promise<LevelNode[]> {
		try {
			const res = await fetch(`/api/browse?subject=${encodeURIComponent(id)}`);
			const j = await res.json();
			return res.ok && j.tree ? (j.tree.levels ?? []) : [];
		} catch {
			return [];
		}
	}

	async function fetchLibraryRaw(): Promise<Package[]> {
		try {
			const res = await fetch('/api/library');
			if (!res.ok) throw new Error('net');
			const j = await res.json();
			const pkgs = j.packages ?? [];
			try {
				localStorage.setItem(LIB_CACHE, JSON.stringify({ at: Date.now(), packages: pkgs }));
			} catch {
				// tiltott storage
			}
			offline = false;
			return pkgs;
		} catch {
			try {
				const raw = localStorage.getItem(LIB_CACHE);
				if (raw) {
					const parsed = JSON.parse(raw) as { at?: unknown; packages?: unknown };
					// Időbélyeg nélküli régi formátum is elfogadott, de csak a lejárati
					// időn belül; lejárt adat nem rajzolódik ki csendben.
					const at = typeof parsed.at === 'number' ? parsed.at : 0;
					if (Date.now() - at <= LIB_CACHE_MS && Array.isArray(parsed.packages)) {
						offline = true;
						return parsed.packages as Package[];
					}
				}
			} catch {
				// sérült gyorstár
			}
			offline = false;
			return [];
		}
	}

	async function fetchDeckLevels(id: string) {
		if (!id) {
			dLevels = [];
			return;
		}
		try {
			dLevels = await getOrFetch(`levels:${id}`, () => fetchLevelsRaw(id), 5 * 60_000);
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

	/* A részletező vissza-nyila ide tér vissza, ha innen nyitották meg. */
	function markFromLibrary() {
		try {
			sessionStorage.setItem('kartyak-detail-back', '/kartyak');
		} catch {
			// tiltott storage
		}
	}

	async function saveDeck() {
		if (!dTitle.trim()) {
			toast.warning('Hiányzik a cím', 'Add meg a csomag címét!');
			return;
		}
		if (dBusy) return;
		dBusy = true;
		try {
			const res = await fetch('/api/decks', {
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

	async function fetchSubjectsRaw(): Promise<Subject[]> {
		try {
			const res = await fetch('/api/browse');
			const j = await res.json();
			return res.ok ? (j.subjects ?? []) : [];
		} catch {
			return [];
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

	// Visszatöltött szintet az első betöltés nem nullázza, váltáskor igen.
	let prevSubject = $state<string | null>(null);

	$effect(() => {
		const id = subjectId;
		if (prevSubject !== null && prevSubject !== id) levelId = '';
		prevSubject = id;
		levelsQ.load(id ? `levels:${id}` : null, () => fetchLevelsRaw(id), LEVELS_TTL, LEVELS_STALE);
	});

	// Mentett szint érvényesítése (csak kártyás szint maradhat).
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
</script>

<svelte:head>
	<title>Kártyák | Leardy</title>
	<meta name="description" content="Saját kártyakönyvtár gyakorláshoz." />
</svelte:head>

<div class="flex items-stretch gap-2">
	<ScopePickers subjects={libSubjects} levels={libLevels} bind:subjectId bind:levelId subjectAllLabel="Összes" />
	<div class="grid shrink-0 place-items-center">
		<IconButton ariaLabel="Felfedezés: hivatalos kártyacsomagok" size={46} onclick={() => void goto('/kartyak/felfedezes')}>
			<Compass size={22} />
		</IconButton>
	</div>
	<div class="grid shrink-0 place-items-center">
		<IconButton ariaLabel="Új kártyacsomag" size={46} onclick={openDeckSheet}>
			<Plus size={22} />
		</IconButton>
	</div>
</div>
	{#if offline}
		<p class="mt-2 inline-block rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] font-extrabold text-amber-600 uppercase dark:text-amber-300">
			Offline nézet
		</p>
	{/if}

	<div class="mt-4">
		{#if loading}
			<div role="status" aria-label="Betöltés" class="grid gap-2">
				{#each [0, 1, 2, 3] as i (i)}
					<div class="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 dark:border-white/10 dark:bg-stone-900">
						<Skeleton cls="size-9 shrink-0 rounded-xl" />
						<div class="min-w-0 flex-1 space-y-1.5">
							<Skeleton cls="h-4 w-3/4 rounded-md" />
							<Skeleton cls="h-3 w-1/2 rounded-md" />
						</div>
						<Skeleton cls="size-4 shrink-0 rounded-full" />
					</div>
				{/each}
				<span class="sr-only">Betöltés…</span>
			</div>
		{:else if visible.length === 0}
			<EmptyState
				title="Üres a könyvtár"
				description="Hozd létre az első saját kártyacsomagodat a + gombbal, vagy kattints a felfedezés gombra."
			/>
		{:else}
			<div class="grid gap-2">
				{#each visible as pkg (pkg.quizId)}
					<a
						href="/kartyak/{encodeURIComponent(pkg.quizId)}"
						onclick={markFromLibrary}
						class="group flex items-center gap-3 overflow-hidden rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 transition hover:border-brand-300 hover:shadow-sm active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 dark:border-white/10 dark:bg-stone-900 dark:hover:border-white/20"
					>
						<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300" aria-hidden="true">
							<Layers size={18} />
						</span>
						<span class="min-w-0 flex-1">
							<span class="font-display block line-clamp-2 text-[15px] leading-snug font-extrabold text-ink-900 dark:text-white">
								{pkg.title}
							</span>
							<span class="mt-0.5 block truncate text-[12px] font-medium text-stone-500 dark:text-stone-400">
								{describe(pkg)}
							</span>
						</span>
						<ChevronRight size={17} class="shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500 motion-reduce:transition-none dark:text-stone-600" />
					</a>
				{/each}
			</div>
		{/if}
	</div>

<Sheet open={deckOpen} label="Új kártyacsomag" title="Új kártyacsomag" onClose={() => (deckOpen = false)}>
	<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Alapértelmezetten csak te látod.</p>
	<label class="mt-4 block text-[13px] font-semibold text-ink-900 dark:text-white" for="deck-title">
		Cím
		<input
			id="deck-title"
			bind:value={dTitle}
			placeholder="Pl. Angol szavak 1"
			class="mt-1.5 {cardInput} w-full"
		/>
	</label>
	<div class="mt-3 grid gap-2">
		<button type="button" onclick={() => (picker = 'subject')} class={pickRowBtn}>
			<span class="min-w-0 flex-1">
				<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Tantárgy</span>
				<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
					{dSubjectTitle || 'Válassz…'}
				</span>
			</span>
			<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
		</button>
		<button type="button" onclick={() => (picker = 'level')} disabled={!dSubject} class={pickRowBtn}>
			<span class="min-w-0 flex-1">
				<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">{dLevelLabel}</span>
				<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
					{dLevelTitle || 'Válassz…'}
				</span>
			</span>
			<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
		</button>
	</div>
	<div class="mt-4">
		<Button block size="lg" disabled={dBusy} onclick={saveDeck}>
			{dBusy ? 'Mentés…' : 'Csomag létrehozása'}
		</Button>
	</div>
</Sheet>

<Sheet open={picker === 'subject'} label="Tantárgy választása" title="Tantárgy" onClose={() => (picker = null)}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		<li>
			<button
				type="button"
				onclick={() => onDSubject('')}
				class={[optRowBtn, !dSubject ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={optTile(!dSubject)}><Shapes size={18} aria-hidden="true" /></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Válassz…</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Nincs besorolás</span>
				</span>
				{#if !dSubject}
					<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
				{/if}
			</button>
		</li>
		{#each subjects as s (s.id)}
			{@const SIcon = subjectIcons[s.icon] ?? Shapes}
			{@const selected = s.id === dSubject}
			<li>
				<button
					type="button"
					onclick={() => onDSubject(s.id)}
					class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={optTile(selected)}><SIcon size={18} aria-hidden="true" /></span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{s.title}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">{s.lessonCount} lecke</span>
					</span>
					{#if selected}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

<Sheet open={picker === 'level'} label="{dLevelLabel} választása" title={dLevelLabel} onClose={() => (picker = null)}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		<li>
			<button
				type="button"
				onclick={() => onDLevel('')}
				class={[optRowBtn, !dLevel ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={optTile(!dLevel)}><Layers size={18} aria-hidden="true" /></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Válassz…</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Nincs {dLevelLabelLow}</span>
				</span>
				{#if !dLevel}
					<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
				{/if}
			</button>
		</li>
		{#each dLevels as l (l.id)}
			{@const selected = l.id === dLevel}
			<li>
				<button
					type="button"
					onclick={() => onDLevel(l.id)}
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

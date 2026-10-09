<script lang="ts" module>
	/** Globális tananyag-választó drawer: Tantárgy, Tananyag, Témakör, Lecke.
	    Alapból a tantárgy-listával nyit, de `baseSubjectId`-vel indulhat
	    rögtön egy tantárgyról. `select` mondja meg, mi választható ki
	    (lecke, témakör vagy tananyag); `multi` esetén + / - jelölés és Kész gomb van.
	    `onlyWithQuiz` csak a min. 1 kvízes elemeket mutatja.
	    A `searchable` kapcsolja a keresőt. Az csak a kiválasztott körön belül
	    keres: tantárgynál és tananyagnál a megjelenő lista szűrődik,
	    témakörnél csak a mostani tananyag, leckénél előbb a mostani témakör,
	    ha ott nincs találat, akkor az azonos tananyag másik témakörei.
	    Bárhol használható, oldalgyökérben kell betenni (Drawer). */

	export interface ContentPick {
		kind: 'lesson' | 'topic' | 'level';
		subjectId: string;
		subjectTitle: string;
		levelId: string;
		levelTitle: string;
		levelLabel: string;
		topicId: string;
		topicTitle: string;
		/** Témakör-választásnál üres. */
		lessonId: string;
		lessonTitle: string;
		quizCount: number;
		/** Morzsa: "Angol - B2 - Unit 1 - B" vagy témakörnél rövidebb. */
		crumb: string;
	}
</script>

<script lang="ts">
	import {
		BookOpen,
		BookOpenText,
		Check,
		ChevronRight,
		Landmark,
		Languages,
		Leaf,
		Minus,
		Plus,
		Search,
		Shapes,
		X
	} from '@lucide/svelte';
	import type {
		LessonRef,
		LevelNode,
		MaterialNode,
		Subject,
		SubjectTree
	} from '$lib/curriculum';
	import Drawer from './Drawer.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import { getOrFetch, peek } from '$lib/query.svelte';
	import { untrack } from 'svelte';
	import { motionOK } from '$lib/overlay';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	const COUNTS_TTL = 60 * 60_000;
	const EDITOR_TREE_TTL = 5 * 60_000;

	interface Props {
		open: boolean;
		subjects: Subject[];
		baseSubjectId?: string;
		/** Nyitáskor erről a tantárgyról indul, a tantárgylistára vissza lehet lépni. */
		startSubjectId?: string;
		select?: 'lesson' | 'topic' | 'level';
		/** Szerkesztői használatban a piszkozatokat is tartalmazó adatforrás. */
		loadTree?: (subjectId: string) => Promise<SubjectTree | null>;
		/** A szerverről már betöltött fa az első nyitáskor is azonnal használható. */
		initialTree?: SubjectTree | null;
		/** Mentés vagy jogosultságváltozás után megváltozó érték üríti a saját gyorstárat. */
		cacheVersion?: unknown;
		selectedLevelId?: string;
		includeAllLevels?: boolean;
		selectedSubjectId?: string;
		searchable?: boolean;
		/** Például a szerkesztési jogosultság jelzése a tananyag sorában. */
		levelNote?: (level: LevelNode) => string;
		onCreateLevel?: (subjectId: string) => void;
		multi?: boolean;
		onlyWithQuiz?: boolean;
		/** Többszöri nyitásnál megőrzött választás (multi). */
		initialSelected?: ContentPick[];
		onClose: () => void;
		onPick: (picks: ContentPick[]) => void;
	}

	let {
		open,
		subjects,
		baseSubjectId = '',
		startSubjectId = '',
		select = 'lesson',
		loadTree,
		initialTree = null,
		cacheVersion,
		selectedLevelId = '',
		includeAllLevels = false,
		selectedSubjectId = '',
		searchable = true,
		levelNote,
		onCreateLevel,
		multi = false,
		onlyWithQuiz = false,
		initialSelected = [],
		onClose,
		onPick
	}: Props = $props();

	type Step = 'subject' | 'level' | 'topic' | 'lesson';

	let trail = $state<Step[]>([]);
	let subject = $state<Subject | null>(null);
	let level = $state<LevelNode | null>(null);
	let topic = $state<MaterialNode | null>(null);
	let starting = $state(false);
	let trees = $state<Record<string, SubjectTree>>({});
	let quizCounts = $state<Record<string, Record<string, number>>>({});
	let loadingTree = $state(false);
	let subjectQuizCounts = $state<Record<string, number>>({});
	let loadingSubjectCounts = $state(false);
	let selected = $state<ContentPick[]>([]);
	let query = $state('');
	let direction = $state(1);
	let animate = $state(false);
	let treeError = $state(false);
	let pendingSubjectId = $state('');
	let selectionVersion = 0;
	let treeVersion = 0;
	let cacheOwner: unknown;
	const treeTimes = new Map<string, number>();
	const treeRequests = new Map<string, Promise<SubjectTree | null>>();

	let step = $derived<Step>(trail.length > 0 ? trail[trail.length - 1] : 'subject');

	// Nyitáskor tiszta lappal indul (a megőrzött választással).
	let wasOpen = $state(false);
	$effect(() => {
		if (open && !wasOpen) {
			wasOpen = true;
			void untrack(start);
		} else if (!open && wasOpen) {
			wasOpen = false;
			selectionVersion++;
			treeVersion++;
		}
	});

	function reset() {
		selectionVersion++;
		treeVersion++;
		pendingSubjectId = '';
		animate = motionOK();
		direction = 1;
		treeError = false;
		trail = [];
		subject = null;
		level = null;
		topic = null;
		starting = false;
		loadingTree = false;
		selected = [...initialSelected];
		query = '';
		const owner = cacheVersion ?? loadTree;
		if (owner !== cacheOwner) {
			cacheOwner = owner;
			trees = {};
			treeTimes.clear();
			treeRequests.clear();
		}
		if (initialTree) {
			trees = { ...trees, [initialTree.id]: initialTree };
			treeTimes.set(initialTree.id, Date.now());
		}
	}

	async function start() {
		reset();
		const initialSubjectId = baseSubjectId || startSubjectId;
		const base = subjects.find((s) => s.id === initialSubjectId) ?? null;
		if (base) {
			if (!baseSubjectId) trail = ['subject'];
			subject = base;
			const cached = cachedTree(base.id);
			if (cached) { pushFirstStep(cached); return; }
			if (select === 'level') trail = [...trail, 'level'];
			starting = true;
			const version = selectionVersion;
			const t = await ensureTree(base.id);
			if (!open || version !== selectionVersion) return;
			starting = false;
			if (select !== 'level') pushFirstStep(t);
		} else {
			subject = null;
			trail = ['subject'];
			if (onlyWithQuiz) void ensureSubjectCounts();
		}
	}

	/** Ékezet-érzéketlen kereséshez. */
	function norm(s: string): string {
		return s
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');
	}

	function matches(hay: string): boolean {
		const q = norm(query.trim());
		return q === '' || norm(hay).includes(q);
	}

	async function ensureSubjectCounts() {
		if (Object.keys(subjectQuizCounts).length > 0 || loadingSubjectCounts) return;
		loadingSubjectCounts = true;
		try {
			// Megosztott gyorstár: a számlálók ritkán változnak, oldalak között is élnek.
			const counts = await getOrFetch<Record<string, number>>(
				'counts:subjects',
				async () => {
					const res = await fetch('/api/browse?quizcounts=1');
					const j = await res.json().catch(() => ({}));
					if (!res.ok || !j.quizCountsBySubject) throw new Error('net');
					return j.quizCountsBySubject as Record<string, number>;
				},
				COUNTS_TTL
			);
			subjectQuizCounts = counts;
		} catch {
			// szűrés nélkül marad
		} finally {
			loadingSubjectCounts = false;
		}
	}

	function cachedTree(id: string): SubjectTree | null {
		if (trees[id] && Date.now() - (treeTimes.get(id) ?? 0) < (loadTree ? EDITOR_TREE_TTL : COUNTS_TTL)) return trees[id];
		if (loadTree) return null;
		const cached = peek<{ tree: SubjectTree; counts?: Record<string, number> }>(`counts:tree:${id}`, COUNTS_TTL);
		if (!cached) return null;
		trees = { ...trees, [id]: cached.tree };
		treeTimes.set(id, Date.now());
		if (cached.counts) quizCounts = { ...quizCounts, [id]: cached.counts };
		return cached.tree;
	}

	async function ensureTree(id: string): Promise<SubjectTree | null> {
		const version = ++treeVersion;
		treeError = false;
		const cached = cachedTree(id);
		if (cached) { loadingTree = false; return cached; }
		loadingTree = true;
		try {
			if (loadTree) {
				let request = treeRequests.get(id);
				if (!request) {
					request = loadTree(id);
					treeRequests.set(id, request);
				}
				let loaded: SubjectTree | null;
				try { loaded = await request; }
				finally { if (treeRequests.get(id) === request) treeRequests.delete(id); }
				if (loaded && version === treeVersion) {
					trees = { ...trees, [id]: loaded };
					treeTimes.set(id, Date.now());
				}
				return loaded;
			}
			const got = await getOrFetch<{ tree: SubjectTree; counts?: Record<string, number> }>(
				`counts:tree:${id}`,
				async () => {
					const res = await fetch(
						`/api/browse?subject=${encodeURIComponent(id)}&quizcounts=1`
					);
					const j = await res.json().catch(() => ({}));
					if (!res.ok || !j.tree) throw new Error('net');
					return { tree: j.tree as SubjectTree, counts: j.quizCounts as Record<string, number> | undefined };
				},
				COUNTS_TTL
			);
			if (version === treeVersion) {
				trees = { ...trees, [id]: got.tree };
				treeTimes.set(id, Date.now());
				if (got.counts) quizCounts = { ...quizCounts, [id]: got.counts };
			}
			return got.tree;
		} catch {
			if (version === treeVersion) treeError = true;
			return null;
		} finally {
			if (version === treeVersion) loadingTree = false;
		}
	}

	function quizCountOf(lessonId: string): number {
		if (!subject) return 0;
		return quizCounts[subject.id]?.[lessonId] ?? 0;
	}

	function topicPass(m: MaterialNode): boolean {
		if (!onlyWithQuiz) return true;
		return m.lessons.some((le) => quizCountOf(le.id) > 0);
	}

	function levelPass(l: LevelNode): boolean {
		if (!onlyWithQuiz) return true;
		return l.materials.some((m) => topicPass(m));
	}

	let tree = $derived(subject ? (trees[subject.id] ?? null) : null);
	let visibleSubjects = $derived(
		(onlyWithQuiz ? subjects.filter((s) => (subjectQuizCounts[s.id] ?? 0) > 0) : subjects).filter(
			(s) => matches(s.title)
		)
	);
	let visibleLevels = $derived(
		(tree?.levels ?? []).filter((l) => levelPass(l) && matches(l.title))
	);
	/** Témakör-találatok: csak a kiválasztott tananyagon belül. */
	let topicResults = $derived.by<{ m: MaterialNode; l: LevelNode }[]>(() => {
		return (level?.materials ?? [])
			.filter((m) => topicPass(m) && matches(m.title))
			.map((m) => ({ m, l: level as LevelNode }));
	});
	/** Lecke-találatok: előbb a mostani témakörben, ha ott nincs, akkor
	    az azonos tananyag másik témaköreiben. Másik tananyagban sosem keres. */
	let lessonResults = $derived.by<{ le: LessonRef; m: MaterialNode; l: LevelNode; global: boolean }[]>(() => {
		const inScope = (topic?.lessons ?? []).filter(
			(le) => (!onlyWithQuiz || quizCountOf(le.id) > 0) && matches(le.title)
		);
		if (query.trim() === '' || inScope.length > 0 || !level) {
			return inScope.map((le) => ({ le, m: topic as MaterialNode, l: level as LevelNode, global: false }));
		}
		const out: { le: LessonRef; m: MaterialNode; l: LevelNode; global: boolean }[] = [];
		for (const m of level.materials) {
			if (m.id === topic?.id || !topicPass(m)) continue;
			for (const le of m.lessons) {
				if (onlyWithQuiz && quizCountOf(le.id) === 0) continue;
				if (matches(`${le.title} ${m.title}`)) out.push({ le, m, l: level, global: true });
			}
		}
		return out;
	});
	const levelLabel = 'Tananyag';

	function pushFirstStep(t: SubjectTree | null) {
		if (select === 'level') { trail = [...trail, 'level']; return; }
		if (!t || t.levels.length === 0) return;
		const levels = t.levels.filter((l) => levelPass(l));
		if (levels.length === 1) chooseLevel(levels[0]);
		else trail = [...trail, 'level'];
	}

	async function chooseSubject(s: Subject) {
		const version = ++selectionVersion;
		direction = 1;
		pendingSubjectId = s.id;
		subject = s;
		level = null;
		topic = null;
		query = '';
		starting = false;
		trail = [...trail, 'level'];
		const t = cachedTree(s.id) ?? await ensureTree(s.id);
		if (!open || version !== selectionVersion) return;
		pendingSubjectId = '';
		if (select === 'level') return;
		// Egyszintes fa: a tananyag-lépést átugorjuk.
		const levels = (t?.levels ?? []).filter((l) => levelPass(l));
		if (t && levels.length === 1) chooseLevel(levels[0]);
	}

	function chooseAllLevels() {
		if (!subject) return;
		onPick([{ kind: 'level', subjectId: subject.id, subjectTitle: subject.title,
			levelId: '', levelTitle: 'Minden tananyag', levelLabel: 'Tananyag',
			topicId: '', topicTitle: '', lessonId: '', lessonTitle: '', quizCount: 0,
			crumb: subject.title }]);
	}

	function chooseLevel(l: LevelNode) {
		if (select === 'level' && subject) {
			onPick([{
				kind: 'level', subjectId: subject.id, subjectTitle: subject.title,
				levelId: l.id, levelTitle: l.title, levelLabel: 'Tananyag',
				topicId: '', topicTitle: '', lessonId: '', lessonTitle: '', quizCount: 0,
				crumb: `${subject.title} - ${l.title}`
			}]);
			return;
		}
		level = l;
		topic = null;
		query = '';
		const mats = l.materials.filter((m) => topicPass(m));
		// Egytémakörös tananyag lecke-módban: egyből a leckék.
		if (select === 'lesson' && mats.length === 1) chooseTopic(l, mats[0], true);
		else trail = [...trail, 'topic'];
	}

	function chooseTopic(l: LevelNode, m: MaterialNode, fromSkip = false) {
		level = l;
		topic = m;
		query = '';
		if (!fromSkip) trail = [...trail, 'lesson'];
		else trail = [...trail, 'topic', 'lesson'];
	}

	function goBack() {
		selectionVersion++;
		treeVersion++;
		pendingSubjectId = '';
		loadingTree = false;
		direction = -1;
		const cur = trail[trail.length - 1];
		trail = trail.slice(0, -1);
		query = '';
		if (cur === 'topic') topic = null;
		else if (cur === 'level') {
			level = null;
			topic = null;
		} else if (cur === 'subject') {
			subject = null;
			level = null;
			topic = null;
		}
		if (trail.length === 0) onClose();
	}

	function pickId(kind: 'lesson' | 'topic', id: string): boolean {
		return selected.some(
			(p) => p.kind === kind && (kind === 'lesson' ? p.lessonId === id : p.topicId === id)
		);
	}

	function makePick(
		kind: 'lesson' | 'topic',
		l: LevelNode,
		m: MaterialNode,
		le?: LessonRef
	): ContentPick | null {
		if (!subject) return null;
		const base = `${subject.title} - ${l.title} - ${m.title}`;
		if (kind === 'topic') {
			return {
				kind,
				subjectId: subject.id,
				subjectTitle: subject.title,
				levelId: l.id,
				levelTitle: l.title,
				levelLabel: 'Tananyag',
				topicId: m.id,
				topicTitle: m.title,
				lessonId: '',
				lessonTitle: '',
				quizCount: m.lessons.reduce((n, x) => n + quizCountOf(x.id), 0),
				crumb: base
			};
		}
		if (!le) return null;
		return {
			kind,
			subjectId: subject.id,
			subjectTitle: subject.title,
			levelId: l.id,
			levelTitle: l.title,
			levelLabel: 'Tananyag',
			topicId: m.id,
			topicTitle: m.title,
			lessonId: le.id,
			lessonTitle: le.title,
			quizCount: quizCountOf(le.id),
			crumb: `${base} - ${le.title}`
		};
	}

	function togglePick(kind: 'lesson' | 'topic', l: LevelNode, m: MaterialNode, le?: LessonRef) {
		const id = kind === 'lesson' ? (le?.id ?? '') : m.id;
		if (!id) return;
		if (pickId(kind, id)) {
			selected = selected.filter(
				(p) => !(p.kind === kind && (kind === 'lesson' ? p.lessonId === id : p.topicId === id))
			);
		} else {
			const p = makePick(kind, l, m, le);
			if (p) selected = [...selected, p];
		}
	}

	function tapTopic(l: LevelNode, m: MaterialNode) {
		if (select === 'topic') {
			if (multi) togglePick('topic', l, m);
			else {
				const p = makePick('topic', l, m);
				if (p) onPick([p]);
			}
		} else {
			chooseTopic(l, m);
		}
	}

	function tapLesson(l: LevelNode, m: MaterialNode, le: LessonRef) {
		if (multi) {
			togglePick('lesson', l, m, le);
		} else {
			const p = makePick('lesson', l, m, le);
			if (p) onPick([p]);
		}
	}

	function crumbSoFar(): string {
		const parts: string[] = [];
		if (subject && step !== 'subject') parts.push(subject.title);
		if (level && (step === 'topic' || step === 'lesson')) parts.push(level.title);
		if (topic && step === 'lesson' && query.trim() === '') parts.push(topic.title);
		return parts.join(' - ');
	}

	const stepTitles: Record<Step, string> = {
		subject: 'Tantárgy',
		level: 'Tananyag',
		topic: 'Témakör',
		lesson: 'Lecke'
	};

	const subjectIcons: Record<string, typeof Landmark> = {
		landmark: Landmark,
		leaf: Leaf,
		languages: Languages,
		book: BookOpenText
	};

	const rowBtn =
		'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100';
	const rowTile =
		'grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300';
	const rowTileSel = 'grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-white';
	const pillRow = (sel: boolean) =>
		[
			'flex items-center gap-1 rounded-2xl p-1 pr-1.5 transition',
			sel ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5'
		].join(' ');
	const toggleBtn = (sel: boolean) =>
		[
			'grid size-9 shrink-0 place-items-center rounded-full border transition active:scale-90',
			sel
				? 'border-brand-500 bg-brand-500 text-white'
				: 'border-stone-300 text-stone-500 hover:bg-white dark:border-white/20 dark:text-stone-300 dark:hover:bg-white/10'
		].join(' ');
</script>

{#snippet skeletonRows(count = 3)}
	{#each Array.from({ length: count }, (_, index) => index) as row (row)}
		<li>
			{#if row === 0}<span class="sr-only" role="status">Tananyag betöltése…</span>{/if}
			<div aria-hidden="true" class="flex items-center gap-2.5 rounded-2xl p-2.5">
				<Skeleton cls="size-9 shrink-0 rounded-xl" />
				<div class="min-w-0 flex-1 space-y-2">
					<Skeleton cls={row % 2 === 0 ? 'h-4 w-2/3 rounded-md' : 'h-4 w-1/2 rounded-md'} />
					<Skeleton cls="h-3 w-1/3 rounded-md" />
				</div>
			</div>
		</li>
	{/each}
{/snippet}

{#snippet searchBox()}
	<div class="relative mt-2">
		<Search
			size={16}
			class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-400 dark:text-stone-500"
			aria-hidden="true"
		/>
		<input
			type="text"
			bind:value={query}
			placeholder="Keresés…"
			aria-label="Keresés"
			autocomplete="off"
			class="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pr-10 pl-10 text-[14px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 motion-reduce:transition-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:bg-white/5 dark:focus:ring-brand-500/20"
		/>
		{#if query}
			<button
				type="button"
				onpointerdown={(event) => event.preventDefault()}
				onclick={() => (query = '')}
				aria-label="Keresés törlése"
				class="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-stone-400 transition hover:bg-black/5 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
			>
				<X size={15} />
			</button>
		{/if}
	</div>
{/snippet}

<Drawer
	{open}
	label="Tananyag választása"
	title={step === 'level' ? (select === 'level' ? subject?.title ?? levelLabel : levelLabel) : stepTitles[step]}
	onBack={trail.length > 1 ? goBack : undefined}
	{onClose}
	wide
	animateHeight={select === 'level'}
>
	{#if select !== 'level' && crumbSoFar()}
		<p class="mt-1 truncate text-[12px] font-semibold text-stone-400 dark:text-stone-500">
			{crumbSoFar()}
		</p>
	{/if}

	{#if starting}
		<ul aria-busy="true" class="-mx-1 mt-2 space-y-0.5">{@render skeletonRows()}</ul>
	{:else if step === 'subject'}
		{#if searchable}{@render searchBox()}{/if}
		<ul in:fly={{ x: direction * 24, duration: select === 'level' && animate ? 220 : 0, easing: cubicOut }} class="-mx-1 mt-2 space-y-0.5">
			{#if onlyWithQuiz && loadingSubjectCounts}
				{@render skeletonRows()}
			{:else if visibleSubjects.length === 0}
				<li>
					<p class="p-2 text-sm text-stone-500 dark:text-stone-400">
						{query.trim()
							? 'Nincs ilyen találat.'
							: onlyWithQuiz
								? 'Nincs kvízes tantárgy.'
								: 'Nincs megjeleníthető tantárgy.'}
					</p>
				</li>
			{:else}
				{#each visibleSubjects as s (s.id)}
					{@const SIcon = subjectIcons[s.icon] ?? Shapes}
					{@const current = select === 'level' && s.id === selectedSubjectId}
					<li>
						<button
							type="button"
							onclick={() => void chooseSubject(s)}
							aria-busy={loadingTree && pendingSubjectId === s.id}
							disabled={loadingTree && pendingSubjectId === s.id}
							aria-pressed={select === 'level' ? current : undefined}
							class={['flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100', current ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
						>
							<span class={current ? rowTileSel : rowTile}>
								<SIcon size={18} aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
									{s.title}
								</span>
								<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
									{select === 'level' ? `${s.levelCount} tananyag` : `${s.lessonCount} lecke`}
								</span>
							</span>
							{#if select === 'level'}
								{#if current}<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
								{:else}<ChevronRight size={17} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />{/if}
							{/if}
						</button>
					</li>
				{/each}
			{/if}
		</ul>
	{:else if step === 'level'}
		{#if searchable}{@render searchBox()}{/if}
		<ul in:fly={{ x: direction * 24, duration: select === 'level' && animate ? 220 : 0, easing: cubicOut }} class="-mx-1 mt-2 space-y-0.5">
			{#if includeAllLevels && select === 'level' && subject && !loadingTree}
				<li class={pillRow(selectedSubjectId === subject.id && selectedLevelId === '')}>
					<button type="button" onclick={chooseAllLevels} class={rowBtn} aria-pressed={selectedSubjectId === subject.id && selectedLevelId === ''}>
						<span class={rowTile}><BookOpen size={18} /></span>
						<span class="min-w-0 flex-1"><span class="block text-[15px] font-extrabold text-ink-900 dark:text-white">Minden tananyag</span><span class="block text-[12px] text-stone-500 dark:text-stone-400">A teljes tantárgy</span></span>
						{#if selectedSubjectId === subject.id && selectedLevelId === ''}<Check size={18} class="shrink-0 text-brand-600" />{/if}
					</button>
				</li>
			{/if}

			{#if loadingTree && !tree}
				{@render skeletonRows()}
			{:else if treeError}
				<li class="p-2 text-sm text-stone-500 dark:text-stone-400">
					<p>Nem sikerült betölteni a tananyagokat.</p>
					<button type="button" onclick={() => { if (subject) void ensureTree(subject.id); }} class="mt-2 rounded-xl px-3 py-2 font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-white/5">Újrapróbálás</button>
				</li>
			{:else if visibleLevels.length === 0}
				<li>
					<p class="p-2 text-center text-sm text-stone-500 dark:text-stone-400">
						{query.trim()
							? 'Nincs ilyen találat.'
							: onlyWithQuiz
								? `Nincs kvízes ${levelLabel.toLowerCase()}.`
								: `Nincs megjeleníthető ${levelLabel.toLowerCase()}.`}
					</p>
				</li>
			{:else}
				{#each visibleLevels as l (l.id)}
					{@const current = select === 'level' && l.id === selectedLevelId}
					<li>
						<button
							type="button"
							onclick={() => chooseLevel(l)}
							aria-pressed={select === 'level' ? current : undefined}
							class={['flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100', current ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
						>
							<span class={[current ? rowTileSel : rowTile, 'text-[15px] font-extrabold'].join(' ')}>
								{l.title.trim().charAt(0).toUpperCase()}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
									{l.title}
								</span>
								<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
									{l.materials.length} témakör
									{#if levelNote} · {levelNote(l)}{/if}
								</span>
							</span>
							{#if current}<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />{/if}
						</button>
					</li>
				{/each}
			{/if}
			{#if onCreateLevel && subject && !loadingTree}
				<li>
					<button type="button" onclick={() => onCreateLevel?.(subject!.id)} class="flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition hover:bg-stone-100 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 dark:hover:bg-white/5">
						<span class={rowTile}><Plus size={18} /></span>
						<span class="min-w-0 flex-1"><span class="block text-[15px] font-extrabold text-ink-900 dark:text-white">Új {levelLabel.toLowerCase()}</span><span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Saját tananyag létrehozása</span></span>
					</button>
				</li>
			{/if}
		</ul>
	{:else if step === 'topic'}
		{#if searchable}{@render searchBox()}{/if}
		<ul class="-mx-1 mt-2 space-y-0.5">
			{#if topicResults.length === 0}
				<li>
					<p class="p-2 text-sm text-stone-500 dark:text-stone-400">
						{query.trim()
							? 'Nincs ilyen találat.'
							: onlyWithQuiz
								? 'Nincs kvízes témakör.'
								: 'Nincs megjeleníthető témakör.'}
					</p>
				</li>
			{:else}
				{#each topicResults as { m, l } (m.id)}
					{@const sel = select === 'topic' && multi && pickId('topic', m.id)}
					<li class={pillRow(sel)}>
						<button type="button" onclick={() => tapTopic(l, m)} class={rowBtn}>
							<span class={sel ? rowTileSel : rowTile}>
								<BookOpen size={18} aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
									{m.title}
								</span>
								<span class="block truncate text-[12px] font-medium text-stone-500 dark:text-stone-400">
									{m.lessons.length} lecke
								</span>
							</span>
						</button>
						{#if select === 'topic' && multi}
							<button
								type="button"
								aria-label={sel ? 'Témakör kivétele' : 'Témakör hozzáadása'}
								aria-pressed={sel}
								onclick={() => togglePick('topic', l, m)}
								class={toggleBtn(sel)}
							>
								{#if sel}<Minus size={16} strokeWidth={3} />{:else}<Plus size={16} strokeWidth={3} />{/if}
							</button>
						{/if}
					</li>
				{/each}
			{/if}
		</ul>
	{:else}
		{#if searchable}{@render searchBox()}{/if}
		<ul class="-mx-1 mt-2 space-y-0.5">
			{#if lessonResults.length === 0}
				<li>
					<p class="p-2 text-sm text-stone-500 dark:text-stone-400">
						{query.trim()
							? 'Nincs ilyen találat.'
							: onlyWithQuiz
								? 'Nincs kvízes lecke.'
								: 'Nincs megjeleníthető lecke.'}
					</p>
				</li>
			{:else}
				{#each lessonResults as { le, m, l, global } (le.id)}
					{@const sel = multi && pickId('lesson', le.id)}
					{@const qc = quizCountOf(le.id)}
					<li class={pillRow(sel)}>
						<button type="button" onclick={() => tapLesson(l, m, le)} class={rowBtn}>
							<span class={sel ? rowTileSel : rowTile}>
								<BookOpen size={18} aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
									{le.title}
								</span>
								<span class="block truncate text-[12px] font-medium text-stone-500 dark:text-stone-400">
									{#if global}{m.title}{:else if qc > 0}{qc} kvíz{/if}
								</span>
							</span>
						</button>
						{#if multi}
							<button
								type="button"
								aria-label={sel ? 'Lecke kivétele' : 'Lecke hozzáadása'}
								aria-pressed={sel}
								onclick={() => togglePick('lesson', l, m, le)}
								class={toggleBtn(sel)}
							>
								{#if sel}<Minus size={16} strokeWidth={3} />{:else}<Plus size={16} strokeWidth={3} />{/if}
							</button>
						{/if}
					</li>
				{/each}
			{/if}
		</ul>
	{/if}

	{#if multi}
		<div class="mt-3">
			<Button block disabled={selected.length === 0} onclick={() => onPick(selected)}>
				Kész ({selected.length})
			</Button>
		</div>
	{/if}
</Drawer>

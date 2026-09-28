<script lang="ts" module>
	/** Globális tananyag-választó drawer: Tantárgy, Szint, Témakör, Lecke.
	    Alapból a tantárgy-listával nyit, de `baseSubjectId`-vel indulhat
	    rögtön egy tantárgyról. `select` mondja meg, mi választható ki
	    (lecke vagy témakör); `multi` esetén + / - jelölés és Kész gomb van.
	    `onlyWithQuiz` csak a min. 1 kvízes elemeket mutatja.
	    Minden szinten van kereső, de az csak a kiválasztott körön belül
	    keres: tantárgynál és szintnél a megjelenő lista szűrődik,
	    témakörnél csak a mostani szint, leckénél előbb a mostani témakör,
	    ha ott nincs találat, akkor az azonos szint másik témakörei.
	    Bárhol használható, oldalgyökérben kell betenni (Drawer). */

	export interface ContentPick {
		kind: 'lesson' | 'topic';
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
	import { getOrFetch } from '$lib/query.svelte';

	const COUNTS_TTL = 60 * 60_000;

	interface Props {
		open: boolean;
		subjects: Subject[];
		baseSubjectId?: string;
		select?: 'lesson' | 'topic';
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
		select = 'lesson',
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

	let step = $derived<Step>(trail.length > 0 ? trail[trail.length - 1] : 'subject');

	// Nyitáskor tiszta lappal indul (a megőrzött választással).
	let wasOpen = $state(false);
	$effect(() => {
		if (open && !wasOpen) {
			wasOpen = true;
			void start();
		} else if (!open && wasOpen) {
			wasOpen = false;
		}
	});

	function reset() {
		trail = [];
		subject = null;
		level = null;
		topic = null;
		starting = false;
		loadingTree = false;
		selected = [...initialSelected];
		query = '';
	}

	async function start() {
		reset();
		const base =
			baseSubjectId !== '' ? (subjects.find((s) => s.id === baseSubjectId) ?? null) : null;
		if (base) {
			subject = base;
			starting = true;
			const t = await ensureTree(base.id);
			starting = false;
			if (!open || subject?.id !== base.id) return;
			pushFirstStep(t);
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

	async function ensureTree(id: string): Promise<SubjectTree | null> {
		const cached = trees[id];
		if (cached) return cached;
		loadingTree = true;
		try {
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
			trees = { ...trees, [id]: got.tree };
			if (got.counts) {
				quizCounts = { ...quizCounts, [id]: got.counts };
			}
			return got.tree;
		} catch {
			return null;
		} finally {
			loadingTree = false;
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
	/** Témakör-találatok: csak a kiválasztott szinten belül. */
	let topicResults = $derived.by<{ m: MaterialNode; l: LevelNode }[]>(() => {
		return (level?.materials ?? [])
			.filter((m) => topicPass(m) && matches(m.title))
			.map((m) => ({ m, l: level as LevelNode }));
	});
	/** Lecke-találatok: előbb a mostani témakörben, ha ott nincs, akkor
	    az azonos szint másik témaköreiben. Másik szintben sosem keres. */
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
	let levelLabel = $derived(subject?.levelLabel || 'Szint');

	function pushFirstStep(t: SubjectTree | null) {
		if (!t || t.levels.length === 0) return;
		const levels = t.levels.filter((l) => levelPass(l));
		if (levels.length === 1) chooseLevel(levels[0]);
		else trail = [...trail, 'level'];
	}

	async function chooseSubject(s: Subject) {
		subject = s;
		level = null;
		topic = null;
		query = '';
		trail = [...trail, 'level'];
		const t = await ensureTree(s.id);
		if (!open || subject?.id !== s.id) return;
		// Egyszintes fa: a szint-lépést átugorjuk.
		const levels = (t?.levels ?? []).filter((l) => levelPass(l));
		if (t && levels.length === 1) chooseLevel(levels[0]);
	}

	function chooseLevel(l: LevelNode) {
		level = l;
		topic = null;
		query = '';
		const mats = l.materials.filter((m) => topicPass(m));
		// Egytémakörös szint lecke-módban: egyből a leckék.
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
				levelLabel: subject.levelLabel || 'Szint',
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
			levelLabel: subject.levelLabel || 'Szint',
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
		level: 'Szint',
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
	title={step === 'level' ? levelLabel : stepTitles[step]}
	onBack={trail.length > 1 ? goBack : undefined}
	{onClose}
	wide
>
	{#if crumbSoFar()}
		<p class="mt-1 truncate text-[12px] font-semibold text-stone-400 dark:text-stone-500">
			{crumbSoFar()}
		</p>
	{/if}

	{#if starting}
		<p class="mt-3 p-2 text-sm text-stone-500 dark:text-stone-400">Töltés…</p>
	{:else if step === 'subject'}
		{@render searchBox()}
		<ul class="-mx-1 mt-2 space-y-0.5">
			{#if onlyWithQuiz && loadingSubjectCounts}
				<li><p class="p-2 text-sm text-stone-500 dark:text-stone-400">Töltés…</p></li>
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
					<li>
						<button
							type="button"
							onclick={() => void chooseSubject(s)}
							class="flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition hover:bg-stone-100 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 dark:hover:bg-white/5"
						>
							<span class={rowTile}>
								<SIcon size={18} aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
									{s.title}
								</span>
								<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
									{s.lessonCount} lecke
								</span>
							</span>
						</button>
					</li>
				{/each}
			{/if}
		</ul>
	{:else if step === 'level'}
		{@render searchBox()}
		<ul class="-mx-1 mt-2 space-y-0.5">
			{#if loadingTree && !tree}
				<li><p class="p-2 text-sm text-stone-500 dark:text-stone-400">Töltés…</p></li>
			{:else if visibleLevels.length === 0}
				<li>
					<p class="p-2 text-sm text-stone-500 dark:text-stone-400">
						{query.trim()
							? 'Nincs ilyen találat.'
							: onlyWithQuiz
								? 'Nincs kvízes szint.'
								: 'Nincs megjeleníthető szint.'}
					</p>
				</li>
			{:else}
				{#each visibleLevels as l (l.id)}
					<li>
						<button
							type="button"
							onclick={() => chooseLevel(l)}
							class="flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition hover:bg-stone-100 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 dark:hover:bg-white/5"
						>
							<span class={[rowTile, 'text-[15px] font-extrabold'].join(' ')}>
								{l.title.trim().charAt(0).toUpperCase()}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
									{l.title}
								</span>
								<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
									{l.materials.length} témakör
								</span>
							</span>
						</button>
					</li>
				{/each}
			{/if}
		</ul>
	{:else if step === 'topic'}
		{@render searchBox()}
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
		{@render searchBox()}
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

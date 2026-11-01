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

	export type { ContentPick } from './content-picker/types';
</script>

<script lang="ts">
	import type {
		LessonRef,
		LevelNode,
		MaterialNode,
		Subject,
		SubjectTree
	} from '$lib/curriculum/curriculum';
	import type { ContentPick, Props, Step } from './content-picker/types';
	import { matches } from './content-picker/search';
	import { crumbSoFar, makePick, pickId, togglePick } from './content-picker/pick-factory';
	import {
		cachedTree,
		ensureSubjectCounts,
		ensureTree,
		type TreeCacheState
	} from './content-picker/tree-cache';
	import {
		chooseAllLevels,
		chooseLevel,
		chooseSubject,
		chooseTopic,
		goBack,
		start,
		type NavDeps,
		type NavState
	} from './content-picker/navigation';
	import Drawer from './Drawer.svelte';
	import Button from '$lib/ui/Button.svelte';
	import PickerSearchBox from './content-picker/PickerSearchBox.svelte';
	import PickerSkeletons from './content-picker/PickerSkeletons.svelte';
	import SubjectStep from './content-picker/SubjectStep.svelte';
	import LevelStep from './content-picker/LevelStep.svelte';
	import TopicStep from './content-picker/TopicStep.svelte';
	import LessonStep from './content-picker/LessonStep.svelte';
	import { invalidate } from '$lib/state/query.svelte';
	import { subscribeContent } from '$lib/content/content-client';
	import { untrack } from 'svelte';
	import { getTutorial } from '$lib/tutorial/controller.svelte';

	const tutorial = getTutorial();

	let {
		open,
		subjects,
		baseSubjectId = '',
		startSubjectId = '',
		tutorialStep,
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

	let liveSubjects = $state<Subject[] | null>(null);
	let availableSubjects = $derived(loadTree ? subjects : liveSubjects ?? subjects);
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

	const treeState: TreeCacheState = {
		get trees() { return trees; },
		set trees(v) { trees = v; },
		get quizCounts() { return quizCounts; },
		set quizCounts(v) { quizCounts = v; },
		get subjectQuizCounts() { return subjectQuizCounts; },
		set subjectQuizCounts(v) { subjectQuizCounts = v; },
		get liveSubjects() { return liveSubjects; },
		set liveSubjects(v) { liveSubjects = v; },
		get loadingTree() { return loadingTree; },
		set loadingTree(v) { loadingTree = v; },
		get loadingSubjectCounts() { return loadingSubjectCounts; },
		set loadingSubjectCounts(v) { loadingSubjectCounts = v; },
		get treeError() { return treeError; },
		set treeError(v) { treeError = v; },
		get treeVersion() { return treeVersion; },
		set treeVersion(v) { treeVersion = v; },
		get selectionVersion() { return selectionVersion; },
		get subject() { return subject; },
		set subject(v) { subject = v; },
		get level() { return level; },
		set level(v) { level = v; },
		get topic() { return topic; },
		set topic(v) { topic = v; },
		get trail() { return trail; },
		set trail(v) { trail = v; },
		get selected() { return selected; },
		set selected(v) { selected = v; },
		get open() { return open; },
		get loadTree() { return loadTree; },
		treeTimes,
		treeRequests
	};

	const navState: NavState = {
		get trail() { return trail; },
		set trail(v) { trail = v; },
		get subject() { return subject; },
		set subject(v) { subject = v; },
		get level() { return level; },
		set level(v) { level = v; },
		get topic() { return topic; },
		set topic(v) { topic = v; },
		get starting() { return starting; },
		set starting(v) { starting = v; },
		get loadingTree() { return loadingTree; },
		set loadingTree(v) { loadingTree = v; },
		get pendingSubjectId() { return pendingSubjectId; },
		set pendingSubjectId(v) { pendingSubjectId = v; },
		get selected() { return selected; },
		set selected(v) { selected = v; },
		get query() { return query; },
		set query(v) { query = v; },
		get direction() { return direction; },
		set direction(v) { direction = v; },
		get animate() { return animate; },
		set animate(v) { animate = v; },
		get treeError() { return treeError; },
		set treeError(v) { treeError = v; },
		get open() { return open; },
		get selectionVersion() { return selectionVersion; },
		set selectionVersion(v) { selectionVersion = v; },
		get treeVersion() { return treeVersion; },
		set treeVersion(v) { treeVersion = v; },
		get cacheOwner() { return cacheOwner; },
		set cacheOwner(v) { cacheOwner = v; },
		get liveSubjects() { return liveSubjects; },
		set liveSubjects(v) { liveSubjects = v; },
		get trees() { return trees; },
		set trees(v) { trees = v; },
		treeTimes,
		treeRequests
	};

	function navDeps(): NavDeps {
		return {
			select,
			baseSubjectId,
			startSubjectId,
			tutorialStep,
			initialSelected,
			initialTree,
			cacheVersion,
			loadTree,
			availableSubjects,
			levelLabel,
			onlyWithQuiz,
			levelPass,
			topicPass,
			cachedTree: (id) => cachedTree(treeState, id),
			ensureTree: (id, cacheOnly) => ensureTree(treeState, id, cacheOnly),
			ensureSubjectCounts: (cacheOnly) => ensureSubjectCounts(treeState, cacheOnly),
			onPick,
			onClose,
			signalScopeSubject: (info) => tutorial?.signal('scope-subject', info)
		};
	}

	// Nyitáskor tiszta lappal indul (a megőrzött választással).
	let wasOpen = $state(false);
	let previousTutorialStep: typeof tutorialStep;
	let previousTutorialSubject = '';
	$effect(() => {
		const requestedSubject = tutorialStep === 'level' ? startSubjectId : '';
		if (open && (!wasOpen || tutorialStep !== previousTutorialStep || requestedSubject !== previousTutorialSubject)) {
			wasOpen = true;
			previousTutorialStep = tutorialStep;
			previousTutorialSubject = requestedSubject;
			void untrack(() => start(navState, navDeps()));
		} else if (!open && wasOpen) {
			wasOpen = false;
			selectionVersion++;
			treeVersion++;
		}
	});

	// Kapcsolatváltáskor a már nyitott választó is az új adatforrásból indul.
	$effect(() => {
		const owner = cacheVersion ?? loadTree;
		if (open && owner !== cacheOwner) void untrack(() => start(navState, navDeps()));
	});

	$effect(() => {
		if (!open || loadTree) return;
		return subscribeContent((message) => {
			if (message.type === 'content-status') return;
			const url = message.url ? new URL(message.url) : null;
			if (url && url.pathname !== '/api/browse') return;
			const id = url?.searchParams.get('subject');
			if (message.type === 'content-deleted' && id) {
				const next = { ...trees }; delete next[id]; trees = next;
				if (subject?.id === id) { subject = null; level = null; topic = null; trail = ['subject']; }
				selected = selected.filter((p) => p.subjectId !== id);
				return;
			}
			if (message.type === 'content-updated') {
				invalidate(id ? `counts:tree:${id}` : 'counts:subjects');
				if (!id) loadingSubjectCounts = false;
			}
			if (message.type === 'content-invalidated') {
				invalidate('counts:'); treeTimes.clear();
			}
			if ((!id || id === subject?.id) && subject) void ensureTree(treeState, subject.id, message.type === 'content-updated' && url?.searchParams.get('quizcounts') === '1');
			if (!id) void ensureSubjectCounts(treeState, message.type === 'content-updated' && url?.searchParams.get('quizcounts') === '1');
		});
	});

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
		(onlyWithQuiz ? availableSubjects.filter((s) => (subjectQuizCounts[s.id] ?? 0) > 0) : availableSubjects).filter(
			(s) => matches(s.title, query)
		)
	);
	let visibleLevels = $derived(
		(tree?.levels ?? []).filter((l) => levelPass(l) && matches(l.title, query))
	);
	/** Témakör-találatok: csak a kiválasztott tananyagon belül. */
	let topicResults = $derived.by<{ m: MaterialNode; l: LevelNode }[]>(() => {
		return (level?.materials ?? [])
			.filter((m) => topicPass(m) && matches(m.title, query))
			.map((m) => ({ m, l: level as LevelNode }));
	});
	/** Lecke-találatok: előbb a mostani témakörben, ha ott nincs, akkor
	    az azonos tananyag másik témaköreiben. Másik tananyagban sosem keres. */
	let lessonResults = $derived.by<{ le: LessonRef; m: MaterialNode; l: LevelNode; global: boolean }[]>(() => {
		const inScope = (topic?.lessons ?? []).filter(
			(le) => (!onlyWithQuiz || quizCountOf(le.id) > 0) && matches(le.title, query)
		);
		if (query.trim() === '' || inScope.length > 0 || !level) {
			return inScope.map((le) => ({ le, m: topic as MaterialNode, l: level as LevelNode, global: false }));
		}
		const out: { le: LessonRef; m: MaterialNode; l: LevelNode; global: boolean }[] = [];
		for (const m of level.materials) {
			if (m.id === topic?.id || !topicPass(m)) continue;
			for (const le of m.lessons) {
				if (onlyWithQuiz && quizCountOf(le.id) === 0) continue;
				if (matches(`${le.title} ${m.title}`, query)) out.push({ le, m, l: level, global: true });
			}
		}
		return out;
	});
	let levelLabel = $derived(subject?.levelLabel || 'Tananyag');

	function tapTopic(l: LevelNode, m: MaterialNode) {
		if (select === 'topic') {
			if (multi) selected = togglePick(selected, 'topic', subject, l, m, undefined, quizCountOf);
			else {
				const p = makePick(subject, 'topic', l, m, undefined, quizCountOf);
				if (p) onPick([p]);
			}
		} else {
			chooseTopic(navState, l, m);
		}
	}

	function tapLesson(l: LevelNode, m: MaterialNode, le: LessonRef) {
		if (multi) {
			selected = togglePick(selected, 'lesson', subject, l, m, le, quizCountOf);
		} else {
			const p = makePick(subject, 'lesson', l, m, le, quizCountOf);
			if (p) onPick([p]);
		}
	}

	const stepTitles: Record<Step, string> = {
		subject: 'Tantárgy',
		level: 'Tananyag',
		topic: 'Témakör',
		lesson: 'Lecke'
	};
</script>

<Drawer
	{open}
	label="Tananyag választása"
	title={step === 'level' ? subject?.title ?? levelLabel : stepTitles[step]}
	onBack={trail.length > 1 ? () => goBack(navState, navDeps()) : undefined}
	{onClose}
	canClose={() => !tutorialStep}
	wide
	animateHeight={select === 'level'}
>
	{#if select !== 'level' && crumbSoFar(subject, level, topic, step, query)}
		<p class="mt-1 truncate text-[12px] font-semibold text-stone-400 dark:text-stone-500">
			{crumbSoFar(subject, level, topic, step, query)}
		</p>
	{/if}

	{#if starting}
		<ul aria-busy="true" class="-mx-1 mt-2 space-y-0.5"><PickerSkeletons /></ul>
	{:else if step === 'subject'}
		{#if searchable}<PickerSearchBox bind:query />{/if}
		<SubjectStep
			subjects={visibleSubjects}
			{select}
			{selectedSubjectId}
			{loadingTree}
			{pendingSubjectId}
			{loadingSubjectCounts}
			{onlyWithQuiz}
			{query}
			tutorialActive={!!tutorial?.active}
			{direction}
			{animate}
			onChoose={(s) => void chooseSubject(navState, navDeps(), s)}
		/>
	{:else if step === 'level'}
		{#if searchable}<PickerSearchBox bind:query />{/if}
		<LevelStep
			levels={visibleLevels}
			{levelLabel}
			{select}
			{selectedLevelId}
			{selectedSubjectId}
			{includeAllLevels}
			{subject}
			{loadingTree}
			{tree}
			{treeError}
			{query}
			{onlyWithQuiz}
			tutorialActive={!!tutorial?.active}
			{direction}
			{animate}
			{levelNote}
			onChooseLevel={(l) => chooseLevel(navState, navDeps(), l)}
			onChooseAll={() => chooseAllLevels(navState, navDeps())}
			onRetry={() => { if (subject) void ensureTree(treeState, subject.id); }}
			{onCreateLevel}
		/>
	{:else if step === 'topic'}
		{#if searchable}<PickerSearchBox bind:query />{/if}
		<TopicStep
			results={topicResults}
			{select}
			{multi}
			{query}
			{onlyWithQuiz}
			isPicked={(id) => pickId(selected, 'topic', id)}
			onTap={tapTopic}
			onToggle={(l, m) => { selected = togglePick(selected, 'topic', subject, l, m, undefined, quizCountOf); }}
		/>
	{:else}
		{#if searchable}<PickerSearchBox bind:query />{/if}
		<LessonStep
			results={lessonResults}
			{multi}
			{query}
			{onlyWithQuiz}
			{quizCountOf}
			isPicked={(id) => pickId(selected, 'lesson', id)}
			onTap={tapLesson}
			onToggle={(l, m, le) => { selected = togglePick(selected, 'lesson', subject, l, m, le, quizCountOf); }}
		/>
	{/if}

	{#if multi}
		<div class="mt-3">
			<Button block disabled={selected.length === 0} onclick={() => onPick(selected)}>
				Kész ({selected.length})
			</Button>
		</div>
	{/if}
</Drawer>

<script lang="ts">
	import { createBackNavigation } from '$lib/back-navigation';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, tick, untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';
	import { rememberEditorScope } from '$lib/editor-scope';
	import { motionOK } from '$lib/overlay';
	import type LessonRichEditor from './lesson/LessonRichEditor.svelte';
	import { auth } from '$lib/auth.svelte';
	import { emptyLessonDoc, editableLessonDoc, validateLessonContent, type LessonContentV1 } from '$lib/lesson-content';
	import { markdownLessonDoc } from '$lib/lesson-markdown';
	import { getLessonDraft, putLessonDraft, removeLessonDraft, lessonDraftKey, type LessonDraft } from '$lib/lesson-draft';
	import ScrollableText from '$lib/ui/ScrollableText.svelte';
	import { ArrowDown, ArrowLeft, ArrowUp, ListChecks, Pencil, Save, Trash2, FileClock, X } from '@lucide/svelte';
	import AddItemButton from '$lib/ui/AddItemButton.svelte';
	import ActionMenu from '$lib/ui/ActionMenu.svelte';
	import Drawer from './Drawer.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { editCurriculum } from '$lib/curriculum-edit-api';
	import { parseEditableSections, type EditorLesson, type EditorQuiz } from '$lib/curriculum-editor';
	import { toast } from '$lib/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';

	let { lesson, initialQuizzes = [] }: { lesson: EditorLesson; initialQuizzes?: EditorQuiz[] } = $props();
	const editorId = $props.id();
	const initialContent: LessonContentV1 = untrack(() => ({ version: 1, sections: lesson.content
		? lesson.content.sections.map((section) => ({ ...section, doc: editableLessonDoc(section.doc) }))
		: parseEditableSections(lesson.body_md).map((section) => ({ slug: section.slug!, title: section.title, intro: section.intro, doc: editableLessonDoc(markdownLessonDoc(section.md)) })) }));
	let title = $state(untrack(() => lesson.title));
	let sections = $state(initialContent.sections);
	let originalTitle = $state(untrack(() => lesson.title));
	let originalBody = $state(untrack(() => lesson.body_md));
	let revision = $state(untrack(() => lesson.contentRevision ?? 0));
	let storedContent = $state(untrack(() => !!lesson.content));
	let savedContent = $state(JSON.stringify(initialContent));
	let content = $derived<LessonContentV1>({ version: 1, sections });
	let serialized = $derived(JSON.stringify(content));
	let dirty = $derived(title !== originalTitle || serialized !== savedContent);
	let busy = $state(false);
	let uploading = $state(false);
	let draftReady = $state(false);
	let locked = $derived(busy || uploading || !draftReady);
	let activeSlug = $state(initialContent.sections[0]?.slug ?? '');
	let pointerSelectingTitle = false;
	let editorGeneration = $state(0);
	let animateSections = $state(false);
	let RichEditor = $state<typeof LessonRichEditor>();
	const sectionEditors: Record<string, { focusContent: () => void } | undefined> = {};
	let pendingFocusSlug = '';
	let editorError = $state('');
	let availableDraft = $state<LessonDraft | null>(null);
	let draftError = $state('');
	let draftQueue: Promise<unknown> = Promise.resolve();
	const userId = $derived(auth.user?.id ?? '');
	function persistDraft() {
		if (!userId || !draftReady || availableDraft || !dirty) return;
		const draft: LessonDraft = { key: lessonDraftKey(userId, lesson.id), userId, lessonId: lesson.id, title, content: JSON.parse(serialized), revision, updatedAt: Date.now() };
		draftQueue = draftQueue.then(() => putLessonDraft(draft)).catch(() => { draftError = 'A helyi piszkozat nem menthető. A Mentés gombbal továbbra is menthetsz.'; });
	}
	let loadingEditor: Promise<void> | undefined;
	function loadEditor() {
		if (RichEditor) return Promise.resolve();
		return loadingEditor ??= import('./lesson/LessonRichEditor.svelte').then((module) => { RichEditor = module.default; editorError = ''; }).catch(() => { editorError = 'A szerkesztő nem töltődött be.'; }).finally(() => { loadingEditor = undefined; });
	}
	let stopFollowing = () => {};
	function sectionSlide(node: Element, params: Parameters<typeof slide>[1]) {
		const transition = slide(node, params);
		// A levágás ne hozzon létre görgethető őst a szövegkurzor számára.
		return { ...transition, css: (t: number, u: number) => `${transition.css!(t, u)}overflow: clip;` };
	}
	function keepSectionPosition(anchor: HTMLElement) {
		stopFollowing();
		const top = anchor.getBoundingClientRect().top;
		const parents: HTMLElement[] = [];
		for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
			if (parent !== document.scrollingElement && /(auto|scroll)/.test(getComputedStyle(parent).overflowY)) parents.push(parent);
		}
		let frame = 0;
		const end = performance.now() + (motionOK() ? 300 : 0);
		const stop = () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('wheel', stop, true);
			window.removeEventListener('touchmove', stop, true);
			window.removeEventListener('pointerdown', stop, true);
			window.removeEventListener('keydown', stopOnNavigation, true);
		};
		function stopOnNavigation(event: KeyboardEvent) {
			if (['Tab', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) stop();
		}
		function follow() {
			if (!anchor.isConnected) { stop(); return; }
			// A kattintott szöveg az összecsukás teljes ideje alatt maradjon a kurzor alatt.
			for (const parent of parents) parent.scrollBy({ top: anchor.getBoundingClientRect().top - top, behavior: 'instant' });
			window.scrollBy({ top: anchor.getBoundingClientRect().top - top, behavior: 'instant' });
			if (performance.now() < end) frame = requestAnimationFrame(follow);
			else stop();
		}
		window.addEventListener('wheel', stop, { capture: true, passive: true });
		window.addEventListener('touchmove', stop, { capture: true, passive: true });
		window.addEventListener('pointerdown', stop, true);
		window.addEventListener('keydown', stopOnNavigation, true);
		frame = requestAnimationFrame(follow);
		stopFollowing = stop;
	}
	function selectSection(slug: string, anchor?: HTMLElement) {
		if (locked || availableDraft) return;
		pendingFocusSlug = '';
		if (activeSlug === slug) return;
		if (anchor) keepSectionPosition(anchor);
		activeSlug = slug;
		void loadEditor();
	}
	function removeSection(slug: string) {
		stopFollowing();
		const index = sections.findIndex((section) => section.slug === slug);
		const nextSlug = sections[index + 1]?.slug ?? sections[index - 1]?.slug ?? '';
		const restoreFocus = document.getElementById(`${editorId}-card-${slug}`)?.contains(document.activeElement);
		if (activeSlug === slug) activeSlug = nextSlug;
		sections = sections.filter((section) => section.slug !== slug);
		if (restoreFocus) void tick().then(() => {
			const target = nextSlug
				? document.getElementById(`${editorId}-card-${nextSlug}`)?.querySelector<HTMLButtonElement>('[aria-expanded]')
				: document.getElementById(`${editorId}-add`);
			target?.focus({ preventScroll: true });
		});
	}
	async function discardDraft() {
		availableDraft = null;
		try { await draftQueue; await removeLessonDraft(userId, lesson.id); } catch { draftError = 'A piszkozat nem törölhető a helyi tárhelyről.'; }
	}
	function restoreDraft() {
		if (!availableDraft) return;
		if (availableDraft.revision !== revision) {
			draftError = 'A lecke a piszkozat óta megváltozott. A piszkozat tartalmát kimásolhatod, de nem mentjük rá az újabb leckére.';
		}
		title = availableDraft.title;
		sections = availableDraft.content.sections;
		revision = availableDraft.revision;
		activeSlug = sections[0]?.slug ?? '';
		editorGeneration++;
		availableDraft = null;
		loadEditor();
	}
	$effect(() => {
		void serialized; void title;
		if (!dirty || !draftReady || availableDraft) return;
		const timer = setTimeout(persistDraft, 350);
		return () => clearTimeout(timer);
	});
	let renameOpen = $state(false);
	let deleteOpen = $state(false);
	let quizTotal = $state(untrack(() => initialQuizzes.reduce((n, q) => n + (q.questions?.length ?? 0), 0)));
	let rename = $state('');
	let formError = $state('');
	const fieldClass = 'w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white';
	let backUrl = $derived(`/tanulas/szerkeszto?${new URLSearchParams({ subject: lesson.subjectId, level: lesson.levelId })}` as const);
	onMount(() => {
		const motionFrame = requestAnimationFrame(() => { animateSections = true; });
		rememberEditorScope(lesson.subjectId, lesson.levelId);
		loadEditor();
		if (userId) void getLessonDraft(userId, lesson.id).then((draft) => {
			if (draft && (JSON.stringify(draft.content) !== savedContent || draft.title !== originalTitle)) availableDraft = draft;
		}).catch(() => { draftError = 'A helyi piszkozatok most nem érhetők el.'; }).finally(() => { draftReady = true; });
		else draftReady = true;
		return () => { cancelAnimationFrame(motionFrame); stopFollowing(); };
	});

	beforeNavigate((navigation) => {
		if (locked) { navigation.cancel(); return; }
		if (!dirty) return;
		persistDraft();
		if (navigation.willUnload) {
			navigation.cancel();
			return;
		}
		if (!confirm('Nem mentett módosítások vannak a leckében. Elhagyod az oldalt?')) navigation.cancel();
	});

	function beforeUnload(event: BeforeUnloadEvent) {
		if (!dirty && !locked) return;
		persistDraft();
		event.preventDefault();
		event.returnValue = '';
	}

	const goBack = createBackNavigation(() => resolve(backUrl), { direct: true });

	const quizLabel = $derived(quizTotal > 0 ? `Kvíz (${quizTotal})` : 'Kvíz');

	function openRename() { rename = title; formError = ''; renameOpen = true; }
	function openDelete() { formError = ''; deleteOpen = true; }

	async function save(nextTitle = title) {
		if (locked || availableDraft) return false;
		if (sections.some((section) => !section.intro && (!section.title.trim() || /[\r\n]/.test(section.title)))) {
			toast.error('Adj minden bekezdésnek egysoros címet.');
			return false;
		}
		busy = true;
		formError = '';
		try {
			const changed = serialized !== savedContent;
			const nextContent = storedContent || changed ? validateLessonContent(content) : undefined;
			const result = await editCurriculum<{ title: string; body_md: string; content: LessonContentV1 | null; contentRevision: number }>({
				action: 'saveLesson', lessonId: lesson.id, levelId: lesson.levelId,
				title: nextTitle, body_md: originalBody, originalTitle, originalBody, originalRevision: revision,
				...(nextContent ? { content: nextContent } : {})
			});
			title = result.title;
			originalTitle = result.title;
			originalBody = result.body_md;
			revision = result.contentRevision;
			storedContent = !!result.content;
			savedContent = serialized;
			await draftQueue;
			if (userId) await removeLessonDraft(userId, lesson.id).catch(() => undefined);
			renameOpen = false;
			toast.success('A lecke mentve');
			return true;
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Nem sikerült menteni a leckét.';
			toast.error(formError);
			return false;
		} finally { busy = false; }
	}

	async function openQuiz() {
		if (locked) return;
		if (dirty && !await save()) return;
		await goto(resolve('/tanulas/szerkeszto/lecke/[id]/kviz', { id: lesson.id }));
	}

	async function deleteLesson() {
		if (locked) return;
		busy = true;
		formError = '';
		try {
			await editCurriculum({ action: 'deleteLesson', lessonId: lesson.id, levelId: lesson.levelId });
			savedContent = serialized;
			originalTitle = title;
			deleteOpen = false;
			await draftQueue;
			if (userId) await removeLessonDraft(userId, lesson.id).catch(() => undefined);
			busy = false;
			await goto(resolve(backUrl), { replaceState: true });
			toast.success('A lecke törölve');
		} catch (err) {
			deleteOpen = false;
			formError = err instanceof Error ? err.message : 'Nem sikerült törölni a leckét.';
			toast.error(formError);
		}
		finally { busy = false; }
	}

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= sections.length || sections[index].intro || sections[target].intro) return;
		[sections[index], sections[target]] = [sections[target], sections[index]];
	}

	async function addSection() {
		if (locked) return;
		stopFollowing();
		await loadEditor();
		if (locked) return;
		const slug = `bekezdes-${crypto.randomUUID()}`;
		pendingFocusSlug = slug;
		sections.push({ slug, title: 'Új bekezdés', doc: emptyLessonDoc(), intro: false });
		activeSlug = slug;
	}
	function revealSection(slug: string) {
		if (activeSlug !== slug || pendingFocusSlug !== slug) return;
		pendingFocusSlug = '';
		const card = document.getElementById(`${editorId}-card-${slug}`);
		sectionEditors[slug]?.focusContent();
		card?.querySelector<HTMLElement>('[role="textbox"]')?.scrollIntoView({ block: 'nearest', behavior: motionOK() ? 'smooth' : 'instant' });
	}
</script>

<svelte:head><title>{title} szerkesztése | Leardy</title></svelte:head>
<svelte:window onbeforeunload={beforeUnload} onpointerdown={() => { pendingFocusSlug = ''; }} onpointerup={() => { pointerSelectingTitle = false; }} onpointercancel={() => { pointerSelectingTitle = false; }} />

<div class="editor-frame">
	<header class="flex items-start gap-3">
		<IconButton ariaLabel="Vissza a tananyag-szerkesztőhöz" size={44} disabled={locked} onclick={goBack}><ArrowLeft size={21} /></IconButton>
		<div class="min-w-0 flex-1">
			<h1 class="font-display break-words text-xl font-extrabold tracking-tight text-ink-900 dark:text-white"><ScrollableText text={title} lines={2} /></h1>
			<p class="truncate text-xs text-stone-500 dark:text-stone-400">{lesson.levelTitle} · {lesson.materialTitle}</p>
		</div>
		<ActionMenu label="Lecke műveletei" disabled={locked} actions={[
			{ id: 'save', label: 'Mentés', icon: Save, promote: 'small', disabled: !dirty, onclick: () => { void save(); } },
			{ id: 'quiz', label: quizLabel, icon: ListChecks, promote: 'small', onclick: () => { void openQuiz(); } },
			{ id: 'rename', label: 'Átnevezés', icon: Pencil, promote: 'small', iconOnly: true, onclick: openRename },
			{ id: 'delete', label: 'Törlés', icon: Trash2, promote: 'small', iconOnly: true, tone: 'danger', onclick: openDelete }
		]} />
	</header>

	{#if availableDraft}
		<div class="draft-notice" role="status">
			<FileClock size={17} class="shrink-0 text-brand-600 dark:text-brand-300" />
			<p class="min-w-0 flex-1 text-xs font-semibold">{availableDraft.revision !== revision ? 'Helyi piszkozat · A lecke azóta megváltozott' : 'Van egy helyi piszkozatod'}</p>
			<button type="button" class="draft-restore" onclick={restoreDraft}>Betöltés</button>
			<IconButton ariaLabel="Piszkozat elvetése" size={32} onclick={() => { void discardDraft(); }}><X size={16} /></IconButton>
		</div>
	{/if}
	<div class="mt-5 flex flex-wrap items-center justify-between gap-2">
		<h2 class="font-extrabold text-ink-900 dark:text-white">Bekezdések</h2>
		<span class="text-xs text-stone-500" aria-live="polite">{uploading ? 'Kép feltöltése…' : busy ? 'Mentés…' : dirty ? '' : 'Minden módosítás mentve'}</span>
	</div>
	{#if draftError}<p role="status" class="mt-2 text-sm text-amber-700 dark:text-amber-300">{draftError}</p>{/if}
	<div class="mt-3">
		{#key editorGeneration}
		{#each sections as section, index (section.slug)}
			<div id={`${editorId}-card-${section.slug}`} in:sectionSlide={{ duration: animateSections && motionOK() ? 260 : 0, easing: cubicInOut }} out:sectionSlide={{ duration: motionOK() ? 260 : 0, easing: cubicInOut }} onintroend={() => revealSection(section.slug)} class="pb-3">
				<section data-lesson-section class="min-w-0 rounded-3xl border border-stone-200 bg-white p-4 sm:p-5 dark:border-white/10 dark:bg-stone-900">
					<div class="mb-3 flex items-end gap-2">
						{#if section.intro}
							<span class="flex min-h-11 min-w-0 flex-1 items-center text-sm font-bold">Bevezetés</span>
						{:else}
							<label class="block min-w-0 flex-1 text-sm font-bold">Bekezdés címe<input class="{fieldClass} mt-1" bind:value={section.title} onpointerdown={() => { pointerSelectingTitle = true; }} onfocus={(event) => { if (!pointerSelectingTitle) void selectSection(section.slug, event.currentTarget); }} onclick={(event) => { void selectSection(section.slug, event.currentTarget); }} maxlength={160} disabled={locked || !!availableDraft} /></label>
						{/if}
						<ActionMenu compact dense menuIconsOnly floating label={`Bekezdés műveletei: ${section.title}`} disabled={locked || !!availableDraft} actions={[
							{ id: 'down', label: 'Le', icon: ArrowDown, disabled: section.intro || index === sections.length - 1, onclick: () => move(index, 1) },
							{ id: 'up', label: 'Fel', icon: ArrowUp, disabled: section.intro || index === 0 || sections[index - 1]?.intro, onclick: () => move(index, -1) },
							{ id: 'delete', label: 'Törlés', icon: Trash2, tone: 'danger', onclick: () => removeSection(section.slug) }
						]} />
					</div>
					{#if RichEditor}<RichEditor bind:this={sectionEditors[section.slug]} initialDoc={section.doc} lessonId={lesson.id} expanded={activeSlug === section.slug} onActivate={(anchor) => { void selectSection(section.slug, anchor); }} disabled={busy || !!availableDraft || !draftReady} onChange={(doc) => { section.doc = doc; }} onBusyChange={(value) => { uploading = value; }} />
					{:else if editorError}<p role="alert" class="text-sm text-red-600">{editorError}</p><Button onclick={loadEditor}>Újrapróbálás</Button>
					{:else}<p class="py-4 text-center text-sm text-stone-500">Szerkesztő betöltése…</p>{/if}
				</section>
			</div>
		{:else}
			<div in:sectionSlide={{ duration: animateSections && motionOK() ? 260 : 0, easing: cubicInOut }} out:sectionSlide={{ duration: motionOK() ? 260 : 0, easing: cubicInOut }} class="mb-3 rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15">Még nincs bekezdés. Adj hozzá egyet a lecke megírásához.</div>
		{/each}
		{/key}
	</div>
	<AddItemButton
		id={`${editorId}-add`}
		label="Bekezdés hozzáadása"
		disabled={locked || !!availableDraft}
		onclick={() => { void addSection(); }}
	/>
	{#if formError && !renameOpen && !deleteOpen}<p role="alert" class="mt-4 text-sm text-red-600 dark:text-red-400">{formError}</p>{/if}
</div>

<Drawer open={renameOpen} label="Lecke átnevezése" title="Lecke átnevezése" onClose={() => { if (!locked) renameOpen = false; }}>
	<form class="mt-4 space-y-4" onsubmit={(event) => { event.preventDefault(); void save(rename); }}>
		<label class="block text-sm font-bold text-ink-900 dark:text-white">Lecke neve<input class="{fieldClass} mt-1" bind:value={rename} required maxlength={160} disabled={locked} /></label>
		{#if formError}<p role="alert" class="text-sm text-red-600 dark:text-red-400">{formError}</p>{/if}
		<Button type="submit" busy={busy} block>Átnevezés és mentés</Button>
	</form>
</Drawer>

<ConfirmDialog
	open={deleteOpen}
	title="Lecke törlése"
	description={`Biztosan törlöd a(z) „${title}” leckét és a hozzá tartozó tananyagot? Ez nem vonható vissza.`}
	confirmLabel="Lecke törlése"
	holdLabel="Tartsd nyomva a törléshez"
	{busy}
	onClose={() => { if (!locked) deleteOpen = false; }}
	onConfirm={() => { void deleteLesson(); }}
/>

<style>
	.editor-frame { container-type: inline-size; overflow-anchor: none; }
	.draft-notice { margin-top: 16px; display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; border: 1px solid var(--color-brand-200); border-radius: 12px; background: var(--color-brand-50); }
	.draft-restore { border-radius: 8px; padding: 7px 10px; font-size: 12px; font-weight: 800; color: var(--color-brand-600); }
	.draft-restore:hover { background: rgb(99 102 241 / .1); }
	.draft-restore:focus-visible { outline: 2px solid var(--color-brand-500); }
	:global(.dark) .draft-notice { border-color: rgb(99 102 241 / .3); background: rgb(99 102 241 / .08); }
	:global(.dark) .draft-restore { color: var(--color-brand-300); }
</style>

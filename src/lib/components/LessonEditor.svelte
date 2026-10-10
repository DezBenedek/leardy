<script lang="ts">
	import { createBackNavigation } from '$lib/back-navigation';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, tick, untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';
	import { rememberEditorScope } from '$lib/editor-scope';
	import { motionOK } from '$lib/overlay';
	import LessonContent from './lesson/LessonContent.svelte';
	import type LessonRichEditor from './lesson/LessonRichEditor.svelte';
	import { auth } from '$lib/auth.svelte';
	import { emptyLessonDoc, editableLessonDoc, lessonNodeText, validateLessonContent, type LessonContentV1 } from '$lib/lesson-content';
	import { markdownLessonDoc } from '$lib/lesson-markdown';
	import { getLessonDraft, putLessonDraft, removeLessonDraft, lessonDraftKey, type LessonDraft } from '$lib/lesson-draft';
	import ScrollableText from '$lib/ui/ScrollableText.svelte';
	import { ArrowDown, ArrowLeft, ArrowUp, ListChecks, Pencil, Plus, Save, Trash2, ChevronDown, Eye } from '@lucide/svelte';
	import ActionMenu from '$lib/ui/ActionMenu.svelte';
	import Drawer from './Drawer.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { editCurriculum } from '$lib/curriculum-edit-api';
	import { parseEditableSections, type EditorLesson, type EditorQuiz } from '$lib/curriculum-editor';
	import { toast } from '$lib/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { portal } from './SubjectPicker.svelte';

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
	let visited = $state(initialContent.sections[0] ? [initialContent.sections[0].slug] : []);
	let editorGeneration = $state(0);
	let RichEditor = $state<typeof LessonRichEditor>();
	let editorError = $state('');
	let previewOpen = $state(false);
	let availableDraft = $state<LessonDraft | null>(null);
	let draftError = $state('');
	let draftSavedSnapshot = $state('');
	let draftQueue: Promise<unknown> = Promise.resolve();
	const userId = $derived(auth.user?.id ?? '');
	function persistDraft() {
		if (!userId || !draftReady || availableDraft || !dirty) return;
		const snapshot = JSON.stringify([title, serialized]);
		const draft: LessonDraft = { key: lessonDraftKey(userId, lesson.id), userId, lessonId: lesson.id, title, content: JSON.parse(serialized), revision, updatedAt: Date.now() };
		draftQueue = draftQueue.then(() => putLessonDraft(draft)).then(() => { draftSavedSnapshot = snapshot; }).catch(() => { draftError = 'A helyi piszkozat nem menthető. A Mentés gombbal továbbra is menthetsz.'; });
	}
	function loadEditor() {
		if (RichEditor) return;
		void import('./lesson/LessonRichEditor.svelte').then((module) => { RichEditor = module.default; editorError = ''; }).catch(() => { editorError = 'A szerkesztő nem töltődött be.'; });
	}
	function selectSection(slug: string) {
		if (locked || availableDraft) return;
		activeSlug = activeSlug === slug ? '' : slug;
		if (activeSlug && !visited.includes(slug)) visited.push(slug);
		loadEditor();
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
		visited = activeSlug ? [activeSlug] : [];
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
		rememberEditorScope(lesson.subjectId, lesson.levelId);
		loadEditor();
		if (userId) void getLessonDraft(userId, lesson.id).then((draft) => {
			if (draft && (JSON.stringify(draft.content) !== savedContent || draft.title !== originalTitle)) availableDraft = draft;
		}).catch(() => { draftError = 'A helyi piszkozatok most nem érhetők el.'; }).finally(() => { draftReady = true; });
		else draftReady = true;
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
		const slug = `bekezdes-${crypto.randomUUID()}`;
		sections.push({ slug, title: 'Új bekezdés', doc: emptyLessonDoc(), intro: false });
		activeSlug = slug;
		visited.push(slug);
		loadEditor();
		await tick();
		document.getElementById(`${editorId}-card-${slug}`)?.scrollIntoView({ block: 'nearest', behavior: motionOK() ? 'smooth' : 'instant' });
	}
</script>

<svelte:head><title>{title} szerkesztése | Leardy</title></svelte:head>
<svelte:window onbeforeunload={beforeUnload} />

<div class="editor-frame">
	<header class="flex items-start gap-3">
		<IconButton ariaLabel="Vissza a tananyag-szerkesztőhöz" size={44} disabled={locked} onclick={goBack}><ArrowLeft size={21} /></IconButton>
		<div class="min-w-0 flex-1">
			<h1 class="font-display break-words text-xl font-extrabold tracking-tight text-ink-900 dark:text-white"><ScrollableText text={title} lines={2} /></h1>
			<p class="truncate text-xs text-stone-500 dark:text-stone-400">{lesson.levelTitle} · {lesson.materialTitle}</p>
		</div>
		<ActionMenu label="Lecke műveletei" disabled={locked} actions={[
			{ id: 'save', label: 'Mentés', icon: Save, promote: 'small', disabled: !dirty, onclick: () => { void save(); } },
			{ id: 'preview', label: 'Előnézet', icon: Eye, promote: 'medium', onclick: () => { previewOpen = true; } },
			{ id: 'quiz', label: quizLabel, icon: ListChecks, promote: 'small', onclick: () => { void openQuiz(); } },
			{ id: 'rename', label: 'Átnevezés', icon: Pencil, promote: 'small', iconOnly: true, onclick: openRename },
			{ id: 'delete', label: 'Törlés', icon: Trash2, promote: 'small', iconOnly: true, tone: 'danger', onclick: openDelete }
		]} />
	</header>

	{#if availableDraft}
		<div class="mt-4 rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
			<p class="text-sm font-bold">Van egy félbehagyott helyi piszkozatod.</p>
			{#if availableDraft.revision !== revision}<p class="mt-1 text-xs">A szerveren azóta újabb változat készült. A piszkozat megnyitása nem írja felül.</p>{/if}
			<div class="mt-3 flex flex-wrap gap-2"><Button onclick={restoreDraft}>Piszkozat megnyitása</Button><Button variant="ghost" onclick={() => { void discardDraft(); }}>Elvetés</Button></div>
		</div>
	{/if}
	<div class="mt-5 flex flex-wrap items-center justify-between gap-2">
		<h2 class="font-extrabold text-ink-900 dark:text-white">Bekezdések</h2>
		<span class="text-xs text-stone-500" aria-live="polite">{uploading ? 'Kép feltöltése…' : busy ? 'Mentés…' : dirty ? draftSavedSnapshot === JSON.stringify([title, serialized]) ? 'Nem mentett módosítások · Helyi piszkozat mentve' : 'Nem mentett módosítások' : 'Minden módosítás mentve'}</span>
	</div>
	{#if draftError}<p role="status" class="mt-2 text-sm text-amber-700 dark:text-amber-300">{draftError}</p>{/if}
	<div class="mt-3">
		{#key editorGeneration}
		{#each sections as section, index (section.slug)}
			<div id={`${editorId}-card-${section.slug}`} transition:slide={{ duration: motionOK() ? 260 : 0, easing: cubicInOut }} class="pb-3">
				<section class="min-w-0 rounded-2xl border border-stone-200 bg-white p-3 sm:p-4 dark:border-white/10 dark:bg-stone-900">
					<div class="flex items-center gap-2">
						<button type="button" class="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 text-left text-sm font-extrabold" aria-expanded={activeSlug === section.slug} disabled={locked || !!availableDraft} onclick={() => selectSection(section.slug)}>
							<ChevronDown size={17} class={activeSlug === section.slug ? 'shrink-0 rotate-180' : 'shrink-0'} /><span class="truncate">{section.title || 'Névtelen bekezdés'}</span>
						</button>
						<ActionMenu compact floating label={`Bekezdés műveletei: ${section.title}`} disabled={locked || !!availableDraft} actions={[
							{ id: 'down', label: 'Le', icon: ArrowDown, disabled: section.intro || index === sections.length - 1, onclick: () => move(index, 1) },
							{ id: 'up', label: 'Fel', icon: ArrowUp, disabled: section.intro || index === 0 || sections[index - 1]?.intro, onclick: () => move(index, -1) },
							{ id: 'delete', label: 'Törlés', icon: Trash2, tone: 'danger', onclick: () => { sections = sections.filter((item) => item.slug !== section.slug); } }
						]} />
					</div>
					{#if activeSlug !== section.slug}<p class="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{lessonNodeText(section.doc).trim() || 'Még nincs tartalom.'}</p>{/if}
					{#if visited.includes(section.slug)}
						<div hidden={activeSlug !== section.slug} class="mt-3">
							{#if !section.intro}<label class="mb-3 block text-xs font-bold">Bekezdés címe<input class="{fieldClass} mt-1" bind:value={section.title} maxlength={160} disabled={locked || !!availableDraft} /></label>{/if}
							{#if RichEditor}<RichEditor initialDoc={section.doc} lessonId={lesson.id} disabled={busy || !!availableDraft || !draftReady} onChange={(doc) => { section.doc = doc; }} onBusyChange={(value) => { uploading = value; }} />
							{:else if editorError}<p role="alert" class="text-sm text-red-600">{editorError}</p><Button onclick={loadEditor}>Újrapróbálás</Button>
							{:else}<p class="py-6 text-center text-sm text-stone-500">Szerkesztő betöltése…</p>{/if}
						</div>
					{/if}
				</section>
			</div>
		{:else}
			<div class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15">Még nincs bekezdés. Adj hozzá egyet a lecke megírásához.</div>
		{/each}
		{/key}
	</div>
	<button
		type="button"
		disabled={locked || !!availableDraft}
		onclick={() => { void addSection(); }}
		class="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-200 py-4 text-sm font-extrabold text-stone-400 transition hover:border-brand-300 hover:text-brand-600 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 dark:border-white/10 dark:text-stone-500 dark:hover:border-brand-500/50 dark:hover:text-white"
	>
		<Plus size={18} strokeWidth={2.75} aria-hidden="true" />
		Bekezdés hozzáadása
	</button>
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

<div use:portal>
	<Sheet open={previewOpen} wide label="Lecke előnézete" title={title} onClose={() => { previewOpen = false; }}>
		<div class="mt-4 space-y-5">{#each sections as section (section.slug)}<section><h3 class="mb-2 font-extrabold">{section.title}</h3><LessonContent doc={section.doc} /></section>{/each}</div>
	</Sheet>
</div>

<style>
	.editor-frame { container-type: inline-size; }
</style>

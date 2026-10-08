<script lang="ts">
	import { createBackNavigation } from '$lib/back-navigation';
	import { lessonPath, lessonEditorPath } from '$lib/lesson-paths';
	import { afterNavigate, beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, BookOpenText, ChevronDown, ChevronRight, LoaderCircle, Pencil, Plus, Settings, Trash2, UserRound } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import { onDestroy } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { motionOK } from '$lib/overlay';
	import Drawer from '$lib/components/Drawer.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ContentPicker from '$lib/components/ContentPicker.svelte';
	import type { EditorCandidate, EditorLevel } from '$lib/curriculum-editor';
	import type { SubjectTree } from '$lib/curriculum';
	import { editCurriculum } from '$lib/curriculum-edit-api';
	import { cachedEditorSearch, type EditorSearchResult } from '$lib/editor-candidate-search';
	import { normHu } from '$lib/deck-history';
	import { loadScope, saveScope } from '$lib/scope';
	import { toast } from '$lib/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import SearchInput from '$lib/ui/SearchInput.svelte';
	import Switch from '$lib/ui/Switch.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const scopeKey = 'tanulas-szerkeszto';
	let scopeRestoreVersion = 0;
	let level = $derived(data.levels.find((item) => item.id === data.levelId));
	let subject = $derived(data.subjects.find((item) => item.id === data.subjectId));
	let pickerTree = $derived<SubjectTree | null>(subject ? { ...subject, levels: data.levels, levelCount: data.levels.length } : null);
	let query = $state('');
	let searchFocus = $state(false);
	let scopeOpen = $state(false);
	let scopeSubjectId = $state('');
	let ordering = $state(false);
	let orderMotion = $state(false);
	let busy = $state(false);
	let navigating = $state(false);
	let settingsOpen = $state(false);
	let levelName = $state('');
	let published = $state(false);
	let email = $state('');
	let addEditorOpen = $state(false);
	let removeEditorDialog = $state<{ address: string; levelId: string } | null>(null);
	let editorCandidates = $state<EditorCandidate[]>([]);
	let searchingEditors = $state(false);
	let editorError = $state('');
	const editorSearchCache = new Map<string, EditorSearchResult>();
	let editorSearchTimer: ReturnType<typeof setTimeout> | undefined;
	let editorSearchController: AbortController | undefined;
	let nameDialog = $state<{ action: 'createLevel' | 'createTopic' | 'renameTopic' | 'createLesson'; title: string; topicId?: string; subjectId?: string } | null>(null);
	let name = $state('');
	let formError = $state('');
	const fieldClass = 'mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/15 dark:bg-white/5 dark:text-white';
	const sectionClass = 'text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500';
	let filteredTopics = $derived((level?.materials ?? []).flatMap((topic) => {
		const needle = normHu(query.trim());
		if (!needle || normHu(topic.title).includes(needle)) return [topic];
		const lessons = topic.lessons.filter((lesson) => normHu(lesson.title).includes(needle));
		return lessons.length ? [{ ...topic, lessons }] : [];
	}));

	function cancelEditorSearch() {
		clearTimeout(editorSearchTimer);
		editorSearchTimer = undefined;
		editorSearchController?.abort();
		editorSearchController = undefined;
		searchingEditors = false;
	}

	onDestroy(() => {
		scopeRestoreVersion++;
		cancelEditorSearch();
	});
	beforeNavigate(() => { scopeRestoreVersion++; });

	afterNavigate(async ({ to }) => {
		const version = ++scopeRestoreVersion;
		if (data.subjectId && data.levelId) {
			saveScope(scopeKey, { subject: data.subjectId, level: data.levelId });
			return;
		}
		// A konkrét szintet megadó link mindig elsőbbséget kap.
		if (!to || to.url.searchParams.get('level')) return;
		const saved = loadScope(scopeKey);
		const requestedSubject = to.url.searchParams.get('subject');
		if (!saved.subject || !saved.level || (requestedSubject && requestedSubject !== saved.subject)) return;
		try {
			// A mentett szintet is a jelenlegi szerkesztési jogosultságokkal ellenőrizzük.
			const levels = data.subjectId === saved.subject ? data.levels : (await loadEditorTree(saved.subject))?.levels;
			if (version !== scopeRestoreVersion || !levels?.some((item) => item.id === saved.level)) return;
			await goto(resolve(editorUrl(saved.subject, saved.level)), { replaceState: true, keepFocus: true, noScroll: true });
		} catch {
			// Sikertelen visszaállításkor a tananyagválasztó továbbra is használható.
		}
	});

	function searchEditors(value: string) {
		email = value;
		cancelEditorSearch();
		const needle = value.trim().toLowerCase();
		const levelId = level?.id;
		editorError = '';
		if (!addEditorOpen || !levelId || needle.length < 2) {
			editorCandidates = [];
			return;
		}
		const cached = cachedEditorSearch(editorSearchCache, needle);
		if (cached) {
			editorCandidates = cached.users;
			return;
		}
		editorCandidates = editorCandidates.filter((candidate) => candidate.email.toLowerCase().includes(needle));
		const controller = new AbortController();
		editorSearchController = controller;
		searchingEditors = true;
		editorSearchTimer = setTimeout(async () => {
			try {
				const response = await fetch(`/api/curriculum/editors?${new URLSearchParams({ level: levelId, q: needle })}`, { signal: controller.signal, cache: 'no-store' });
				const result = await response.json();
				if (!response.ok) throw new Error(result.message ?? 'Nem sikerült keresni a felhasználók között.');
				if (!controller.signal.aborted) {
					const searchResult: EditorSearchResult = { users: result.users, hasMore: result.hasMore !== false };
					editorSearchCache.set(needle, searchResult);
					editorCandidates = searchResult.users;
				}
			} catch (err) {
				if (!controller.signal.aborted) editorError = err instanceof Error ? err.message : 'Nem sikerült keresni a felhasználók között.';
			} finally {
				if (!controller.signal.aborted) searchingEditors = false;
			}
		}, 350);
	}

	function toggleOrdering() {
		orderMotion = motionOK();
		ordering = !ordering;
	}

	function editorUrl(subjectId: string, levelId = ''): `/tanulas/szerkeszto?${string}` {
		return `/tanulas/szerkeszto?${new URLSearchParams({ subject: subjectId, level: levelId })}`;
	}

	async function changeScope(subjectId: string, levelId = '') {
		if (busy || navigating) return;
		navigating = true;
		try { await goto(resolve(editorUrl(subjectId, levelId)), { keepFocus: true, noScroll: true }); query = ''; ordering = false; }
		catch (err) { toast.error(err instanceof Error ? err.message : 'Nem sikerült váltani a tananyagot.'); }
		finally { navigating = false; }
	}

	async function loadEditorTree(subjectId: string): Promise<SubjectTree | null> {
		const selected = data.subjects.find((item) => item.id === subjectId);
		if (!selected) return null;
		const response = await fetch(`/api/curriculum?${new URLSearchParams({ subject: subjectId })}`, { cache: 'no-store' });
		const result = await response.json();
		if (!response.ok) throw new Error(result.message ?? 'Nem sikerült betölteni a szinteket.');
		const levels = (result.levels as EditorLevel[]).filter((item) => item.canEdit);
		return { ...selected, levels, levelCount: levels.length };
	}

	function openScope() {
		scopeSubjectId = level ? data.subjectId : '';
		scopeOpen = true;
	}

	function createLevel(subjectId: string) {
		const selected = data.subjects.find((item) => item.id === subjectId);
		scopeSubjectId = subjectId;
		scopeOpen = false;
		openName('createLevel', `Új ${(selected?.levelLabel ?? 'szint').toLowerCase()}`);
		if (nameDialog) nameDialog.subjectId = subjectId;
	}

	function backToLevels() {
		if (busy || nameDialog?.action !== 'createLevel') return;
		scopeSubjectId = nameDialog.subjectId ?? data.subjectId;
		nameDialog = null;
		scopeOpen = true;
	}

	const goBack = createBackNavigation(() => resolve('/tanulas'), { direct: true });

	function openName(action: NonNullable<typeof nameDialog>['action'], title: string, topicId?: string, current = '') {
		name = current;
		formError = '';
		nameDialog = { action, title, topicId };
	}

	async function saveName(event: SubmitEvent) {
		event.preventDefault();
		if (!nameDialog || busy) return;
		const dialog = nameDialog;
		busy = true;
		formError = '';
		try {
			const subjectId = dialog.subjectId ?? data.subjectId;
			const result = await editCurriculum<{ id: string }>({ action: dialog.action, title: name, subjectId, levelId: level?.id, topicId: dialog.topicId });
			nameDialog = null;
			if (dialog.action === 'createLevel') await goto(resolve(editorUrl(subjectId, result.id)));
			else if (dialog.action === 'createLesson') await goto(lessonEditorPath(result.id));
			else await invalidateAll();
			toast.success('Mentve');
		} catch (err) { formError = err instanceof Error ? err.message : 'Nem sikerült menteni.'; }
		finally { busy = false; }
	}

	function openSettings() {
		if (!level?.canEdit) return;
		levelName = level.title;
		published = level.published;
		email = '';
		formError = '';
		settingsOpen = true;
	}

	async function saveSettings(event: SubmitEvent) {
		event.preventDefault();
		if (!level || busy) return;
		busy = true;
		formError = '';
		try {
			await editCurriculum({ action: 'updateLevel', levelId: level.id, title: levelName, published });
			await invalidateAll();
			settingsOpen = false;
			toast.success('A szint beállításai mentve');
		} catch (err) { formError = err instanceof Error ? err.message : 'Nem sikerült menteni.'; }
		finally { busy = false; }
	}

	async function updateEditor(action: 'addEditor' | 'removeEditor', address: string) {
		if (!level || busy) return;
		busy = true;
		formError = '';
		editorError = '';
		try {
			await editCurriculum({ action, levelId: level.id, email: address });
			email = '';
			await invalidateAll();
			if (action === 'addEditor') closeAddEditor();
			toast.success(action === 'addEditor' ? 'Szerkesztő hozzáadva' : 'Szerkesztő eltávolítva');
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Nem sikerült menteni.';
			if (action === 'addEditor') editorError = message;
			else formError = message;
		}
		finally { busy = false; }
	}

	function openRemoveEditor(address: string) {
		if (!level?.canEdit || busy) return;
		formError = '';
		removeEditorDialog = { address, levelId: level.id };
		settingsOpen = false;
	}

	function closeRemoveEditor() {
		const levelId = removeEditorDialog?.levelId;
		removeEditorDialog = null;
		settingsOpen = level?.id === levelId && !!level?.canEdit;
	}

	async function confirmRemoveEditor() {
		if (!removeEditorDialog || busy) return;
		if (level?.id !== removeEditorDialog.levelId || !level.canEdit) {
			closeRemoveEditor();
			return;
		}
		await updateEditor('removeEditor', removeEditorDialog.address);
		closeRemoveEditor();
	}

	function openAddEditor() {
		cancelEditorSearch();
		editorSearchCache.clear();
		editorCandidates = [];
		email = '';
		editorError = '';
		settingsOpen = false;
		addEditorOpen = true;
	}

	function closeAddEditor() {
		cancelEditorSearch();
		addEditorOpen = false;
		settingsOpen = !!level?.canEdit;
	}

	async function move(kind: 'topic' | 'lesson', id: string, direction: number, topicId?: string) {
		if (!level?.canEdit || busy) return;
		const items = kind === 'topic' ? level.materials : level.materials.find((topic) => topic.id === topicId)?.lessons ?? [];
		const ids = items.map((item) => item.id);
		const index = ids.indexOf(id);
		const target = index + direction;
		if (index < 0 || target < 0 || target >= ids.length) return;
		[ids[index], ids[target]] = [ids[target], ids[index]];
		busy = true;
		try {
			await editCurriculum({ action: kind === 'topic' ? 'reorderTopics' : 'reorderLessons', levelId: level.id, topicId, ids });
			await invalidateAll();
		} catch (err) { toast.error(err instanceof Error ? err.message : 'Nem sikerült módosítani a sorrendet.'); }
		finally { busy = false; }
	}
</script>

<svelte:head><title>Tananyag szerkesztése | Leardy</title></svelte:head>

<header class={['flex items-center', searchFocus ? 'gap-0' : 'gap-2']}>
	<div class="shrink-0 overflow-hidden transition-[width,opacity] duration-200 motion-reduce:transition-none" style:width={searchFocus ? '0px' : '44px'} style:opacity={searchFocus ? 0 : 1}>
		<IconButton ariaLabel="Vissza a tanuláshoz" size={44} disabled={searchFocus} onclick={goBack}><ArrowLeft size={21} /></IconButton>
	</div>
	<h1 class={['min-w-0 shrink-0 overflow-hidden transition-[max-width,opacity] duration-200 motion-reduce:transition-none', !level && 'flex-1']} style:max-width={searchFocus ? '0px' : level ? 'calc(100% - 214px)' : 'calc(100% - 52px)'} style:opacity={searchFocus ? 0 : 1}>
		<button
			type="button"
			aria-label={level ? `Tantárgy és szint választása: ${subject?.title}, ${level.title}` : 'Tantárgy és szint választása'}
			aria-haspopup="dialog"
			aria-expanded={scopeOpen}
			title={level ? `${subject?.title}: ${level.title}` : 'Tananyag választása'}
			disabled={busy || navigating || searchFocus}
			onclick={openScope}
			class="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-left transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100 dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
		>
			<span class="min-w-0 flex-1">
				<span class="block truncate text-[11px] font-bold tracking-wider text-stone-400 uppercase dark:text-stone-500">{subject?.title ?? 'Tantárgy és szint'}</span>
				<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">{level?.title ?? 'Válassz tananyagot'}</span>
			</span>
			<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
		</button>
	</h1>
	{#if level}
		<SearchInput bind:value={query} expandable disabled={busy || navigating} ariaLabel="Keresés a témakörök és leckék között" placeholder="Keresés…" onfocus={() => (searchFocus = true)} onblur={() => (searchFocus = false)} />
		<div class="shrink-0 overflow-hidden transition-[width,opacity] duration-200 motion-reduce:transition-none" style:width={searchFocus ? '0px' : '46px'} style:opacity={searchFocus ? 0 : 1}>
			<IconButton ariaLabel={ordering ? 'Sorrendmódosítás bezárása' : 'Sorrend módosítása'} size={46} disabled={!level.canEdit || busy || navigating || searchFocus} onclick={toggleOrdering}><ArrowUpDown size={21} /></IconButton>
		</div>
		<div class="shrink-0 overflow-hidden transition-[width,opacity] duration-200 motion-reduce:transition-none" style:width={searchFocus ? '0px' : '46px'} style:opacity={searchFocus ? 0 : 1}>
			<IconButton ariaLabel="A szint beállításai" size={46} disabled={!level.canEdit || busy || navigating || searchFocus} onclick={openSettings}><Settings size={21} /></IconButton>
		</div>
	{/if}
</header>

{#if level && !level.canEdit}
	<div class="mt-4 rounded-2xl bg-stone-100 p-4 text-sm text-stone-600 dark:bg-white/5 dark:text-stone-300">
		<p>Ezt a szintet csak a szerkesztői módosíthatják.</p>
		{#if data.canCreate}<div class="mt-3"><Button size="sm" onclick={() => openName('createLevel', 'Új saját szint')}><Plus size={16} /> Saját szint létrehozása</Button></div>{/if}
	</div>
{/if}

<div class="mt-5 space-y-4" aria-busy={busy || navigating}>
	{#each filteredTopics as topic (topic.id)}
		{@const topicIndex = level?.materials.findIndex((item) => item.id === topic.id) ?? 0}
		<section class="overflow-hidden rounded-3xl border border-stone-200 bg-white dark:border-white/10 dark:bg-stone-900">
			<div class="flex items-center gap-2 border-b border-stone-100 p-4 dark:border-white/10">
				<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><BookOpenText size={18} /></span>
				<h2 class="min-w-0 flex-1 break-words text-base font-extrabold text-ink-900 dark:text-white">{topic.title}</h2>
				{#if level?.canEdit}
					<div class="ml-auto flex shrink-0 items-center gap-2">
					{#if ordering}
						<div class="flex shrink-0 items-center gap-2 overflow-hidden" transition:slide={{ axis: 'x', duration: orderMotion ? 180 : 0, easing: cubicOut }}>
						<IconButton ariaLabel="Témakör feljebb: {topic.title}" size={44} disabled={busy || topicIndex === 0} onclick={() => { void move('topic', topic.id, -1); }}><ArrowUp size={17} /></IconButton>
						<IconButton ariaLabel="Témakör lejjebb: {topic.title}" size={44} disabled={busy || topicIndex === level.materials.length - 1} onclick={() => { void move('topic', topic.id, 1); }}><ArrowDown size={17} /></IconButton>
						</div>
					{/if}
					<IconButton ariaLabel="Témakör átnevezése: {topic.title}" size={44} disabled={busy} onclick={() => openName('renameTopic', 'Témakör átnevezése', topic.id, topic.title)}><Pencil size={17} /></IconButton>
					<IconButton ariaLabel="Lecke hozzáadása: {topic.title}" size={44} disabled={busy} onclick={() => openName('createLesson', 'Új lecke', topic.id)}><Plus size={18} /></IconButton>
					</div>
				{/if}
			</div>
			<ul class="divide-y divide-stone-100 dark:divide-white/5">
				{#each topic.lessons as lesson (lesson.id)}
					{@const lessonIndex = level?.materials.find((item) => item.id === topic.id)?.lessons.findIndex((item) => item.id === lesson.id) ?? 0}
					{@const lessonCount = level?.materials.find((item) => item.id === topic.id)?.lessons.length ?? 0}
					<li class="flex items-center gap-2 px-4">
						<a href={level?.canEdit ? lessonEditorPath(lesson.id) : lessonPath(lesson.id)} class="flex min-w-0 flex-1 items-center gap-2 py-4 text-sm font-bold text-ink-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-300">
							<span class="min-w-0 flex-1 break-words">{lesson.title}</span><ChevronRight size={18} class="shrink-0 text-stone-400" />
						</a>
						{#if ordering && level?.canEdit}
							<div class="flex shrink-0 items-center gap-2 overflow-hidden" transition:slide={{ axis: 'x', duration: orderMotion ? 180 : 0, easing: cubicOut }}>
							<IconButton ariaLabel="Lecke feljebb: {lesson.title}" size={44} disabled={busy || lessonIndex === 0} onclick={() => { void move('lesson', lesson.id, -1, topic.id); }}><ArrowUp size={17} /></IconButton>
							<IconButton ariaLabel="Lecke lejjebb: {lesson.title}" size={44} disabled={busy || lessonIndex === lessonCount - 1} onclick={() => { void move('lesson', lesson.id, 1, topic.id); }}><ArrowDown size={17} /></IconButton>
							</div>
						{/if}
					</li>
				{:else}
					<li class="px-5 py-5 text-sm text-stone-500 dark:text-stone-400">Még nincs lecke. A + gombbal hozzáadhatsz egyet.</li>
				{/each}
			</ul>
		</section>
	{:else}
		<div class="rounded-3xl border border-dashed border-stone-300 p-8 text-center dark:border-white/15">
			<BookOpenText size={32} class="mx-auto mb-3 text-stone-400" />
			<p class="font-bold text-ink-900 dark:text-white">{query ? 'Nincs találat.' : level ? 'Még nincs témakör.' : 'Válassz tantárgyat és szintet'}</p>
			{#if !query && level?.canEdit}<div class="mt-4"><Button onclick={() => openName('createTopic', 'Új témakör')}><Plus size={18} /> Témakör hozzáadása</Button></div>
			{:else if !query && !level}<div class="mt-4"><Button onclick={openScope}>Tananyag választása</Button></div>{/if}
		</div>
	{/each}
	{#if level?.canEdit && filteredTopics.length > 0}
		<div class="flex justify-center"><Button variant="ghost" onclick={() => openName('createTopic', 'Új témakör')}><Plus size={18} /> Témakör hozzáadása</Button></div>
	{/if}
</div>

<ContentPicker open={scopeOpen} subjects={data.subjects} select="level" loadTree={loadEditorTree}
	initialTree={pickerTree} cacheVersion={data}
	startSubjectId={scopeSubjectId}
	selectedLevelId={data.levelId} selectedSubjectId={data.subjectId} searchable={false}
	levelNote={() => 'Szerkesztheted'} onClose={() => (scopeOpen = false)}
	onPick={(picks) => { const pick = picks[0]; if (!pick) return; scopeOpen = false; void changeScope(pick.subjectId, pick.levelId); }}
	onCreateLevel={data.canCreate ? createLevel : undefined} />

<Drawer open={nameDialog !== null} label={nameDialog?.title ?? 'Név megadása'} title={nameDialog?.title} onBack={nameDialog?.action === 'createLevel' ? backToLevels : undefined} onClose={() => { if (!busy) nameDialog = null; }}>
	<form onsubmit={saveName} class="mt-4 space-y-4">
		<label class="block text-sm font-bold text-ink-900 dark:text-white">Név<input class={fieldClass} bind:value={name} required maxlength={160} disabled={busy} /></label>
		{#if nameDialog?.action === 'createLevel'}<p class="text-sm text-stone-500 dark:text-stone-400">Te leszel a szint tulajdonosa és szerkesztője. A szint piszkozatként jön létre.</p>{/if}
		{#if formError}<p role="alert" class="text-sm text-red-600 dark:text-red-400">{formError}</p>{/if}
		<Button type="submit" busy={busy} block>{nameDialog?.action.startsWith('create') ? 'Létrehozás' : 'Mentés'}</Button>
	</form>
</Drawer>

<Drawer open={settingsOpen} label="A szint beállításai" onClose={() => { if (!busy) settingsOpen = false; }}>
	{#snippet header()}
		<label for="level-name" class="min-w-0 flex-1 {sectionClass}">{subject?.levelLabel ?? 'Szint'} neve</label>
		<button type="submit" form="level-settings" disabled={busy} aria-busy={busy} class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-brand-600 active:scale-95 disabled:opacity-60 motion-reduce:transition-none">
			{#if busy}<LoaderCircle size={15} class="animate-spin motion-reduce:animate-none" />{/if} Mentés
		</button>
	{/snippet}
	<form id="level-settings" onsubmit={saveSettings}>
		<input id="level-name" aria-label={`${subject?.levelLabel ?? 'Szint'} neve`} class={fieldClass} bind:value={levelName} required maxlength={160} disabled={busy} />
		<div class="mt-4 flex items-center gap-3 py-3">
			<div class="min-w-0 flex-1"><p class={sectionClass}>Publikálva</p><p class="mt-1 text-xs text-stone-500 dark:text-stone-400">A tanulók is láthatják a tananyagot.</p></div>
			<Switch id="level-published" bind:checked={published} label="Publikálva" disabled={busy} />
		</div>
	</form>
	<div class="mt-4 border-t border-stone-100 pt-4 dark:border-white/5">
		<div class="flex items-center justify-between gap-3">
			<h3 class={sectionClass}>Szerkesztők</h3>
			<IconButton ariaLabel="Szerkesztő hozzáadása" size={36} disabled={busy} onclick={openAddEditor}><Plus size={18} /></IconButton>
		</div>
		<ul class="mt-1 divide-y divide-stone-100 dark:divide-white/5">
			{#if level?.ownerEmail}<li class="flex items-center gap-2 py-3 text-sm"><span class="min-w-0 flex-1 break-all text-ink-900 dark:text-white">{level.ownerEmail}</span><span class="text-xs text-stone-500 dark:text-stone-400">Tulajdonos</span></li>{/if}
			{#each level?.editors ?? [] as address (address)}
				<li class="flex items-center gap-2 py-2 text-sm"><span class="min-w-0 flex-1 break-all text-ink-900 dark:text-white">{address}</span><IconButton ariaLabel="Szerkesztő eltávolítása: {address}" tone="danger" size={36} disabled={busy} onclick={() => openRemoveEditor(address)}><Trash2 size={16} /></IconButton></li>
			{/each}
		</ul>
	</div>
	{#if formError}<p role="alert" class="mt-4 text-sm text-red-600 dark:text-red-400">{formError}</p>{/if}
</Drawer>

<ConfirmDialog
	open={removeEditorDialog !== null}
	title="Szerkesztő eltávolítása"
	description={`Eltávolítod a(z) „${removeEditorDialog?.address ?? ''}” szerkesztőt? Ezután nem szerkesztheti ezt a tananyagot.`}
	confirmLabel="Eltávolítás"
	holdLabel="Tartsd nyomva az eltávolításhoz"
	{busy}
	onClose={() => { if (!busy) closeRemoveEditor(); }}
	onConfirm={() => { void confirmRemoveEditor(); }}
/>

<Drawer open={addEditorOpen} label="Szerkesztő hozzáadása" title="Szerkesztő hozzáadása" onBack={() => { if (!busy) closeAddEditor(); }} onClose={() => { if (!busy) closeAddEditor(); }}>
	<label class="mt-4 block {sectionClass}" for="editor-email">E-mail-cím</label>
	<input id="editor-email" type="text" inputmode="email" autocomplete="off" class={fieldClass} value={email} oninput={(event) => searchEditors(event.currentTarget.value)} maxlength={254} disabled={busy} placeholder="Kezdd el beírni az e-mail-címet…" />
	<div class="mt-3" aria-live="polite" aria-busy={searchingEditors || busy}>
		{#if searchingEditors}
			<p role="status" class="animate-pulse py-3 text-sm text-stone-500 motion-reduce:animate-none dark:text-stone-400">Keresés…</p>
		{/if}
		{#if editorError}
			<p role="alert" class="py-3 text-sm text-red-600 dark:text-red-400">{editorError}</p>
		{:else if email.trim().length < 2}
			<p class="py-3 text-sm text-stone-500 dark:text-stone-400">Írj be legalább 2 karaktert az e-mail-címből.</p>
		{:else if editorCandidates.length === 0}
			{#if !searchingEditors}<p class="py-3 text-sm text-stone-500 dark:text-stone-400">Nincs hozzáadható felhasználó ezzel az e-mail-címmel.</p>{/if}
		{:else}
			<ul class="-mx-1 space-y-0.5">
				{#each editorCandidates as candidate (candidate.id)}
					<li><button type="button" disabled={busy} aria-label={`Szerkesztő hozzáadása: ${candidate.email}`} onclick={() => { void updateEditor('addEditor', candidate.email); }} class="flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition hover:bg-stone-100 active:scale-[0.99] disabled:opacity-50 motion-reduce:transition-none dark:hover:bg-white/5">
						<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300"><UserRound size={18} /></span>
						<span class="min-w-0 flex-1"><span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{candidate.name}</span><span class="block truncate text-xs text-stone-500 dark:text-stone-400">{candidate.email}</span></span>
						<Plus size={18} class="shrink-0 text-brand-600 dark:text-brand-300" />
					</button></li>
				{/each}
			</ul>
		{/if}
	</div>
</Drawer>

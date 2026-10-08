<script lang="ts">
	import { createBackNavigation } from '$lib/back-navigation';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tick, untrack } from 'svelte';
	import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, Save, Trash2 } from '@lucide/svelte';
	import ActionMenu from '$lib/ui/ActionMenu.svelte';
	import Drawer from './Drawer.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { editCurriculum } from '$lib/curriculum-edit-api';
	import { parseEditableSections, serializeEditableSections, type EditorLesson } from '$lib/curriculum-editor';
	import { toast } from '$lib/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';

	let { lesson }: { lesson: EditorLesson } = $props();
	const editorId = $props.id();
	let nextSectionId = 0;
	let title = $state(untrack(() => lesson.title));
	let sections = $state(untrack(() => parseEditableSections(lesson.body_md)));
	let originalTitle = $state(untrack(() => lesson.title));
	let originalBody = $state(untrack(() => lesson.body_md));
	let savedSections = $state(untrack(() => serializeEditableSections(sections)));
	let body = $derived(serializeEditableSections(sections));
	let dirty = $derived(title !== originalTitle || body !== savedSections);
	let busy = $state(false);
	let renameOpen = $state(false);
	let deleteOpen = $state(false);
	let rename = $state('');
	let formError = $state('');
	const fieldClass = 'w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white';
	let backUrl = $derived(`/tanulas/szerkeszto?${new URLSearchParams({ subject: lesson.subjectId, level: lesson.levelId })}` as const);

	beforeNavigate((navigation) => {
		if (!dirty) return;
		if (navigation.willUnload) {
			navigation.cancel();
			return;
		}
		if (!confirm('A leckében nem mentett módosítások vannak. Elhagyod az oldalt?')) navigation.cancel();
	});

	function beforeUnload(event: BeforeUnloadEvent) {
		if (!dirty) return;
		event.preventDefault();
		event.returnValue = '';
	}

	const goBack = createBackNavigation(() => resolve(backUrl), { direct: true });

	function openRename() { rename = title; formError = ''; renameOpen = true; }
	function openDelete() { formError = ''; deleteOpen = true; }

	async function save(nextTitle = title) {
		if (busy) return;
		if (sections.some((section) => !section.intro && (!section.title.trim() || /[\r\n]/.test(section.title)))) {
			toast.error('Adj minden bekezdésnek egysoros címet.');
			return;
		}
		busy = true;
		formError = '';
		const nextBody = body === savedSections ? originalBody : body;
		try {
			const result = await editCurriculum<{ title: string; body_md: string }>({
				action: 'saveLesson', lessonId: lesson.id, levelId: lesson.levelId,
				title: nextTitle, body_md: nextBody, originalTitle, originalBody
			});
			title = result.title;
			originalTitle = result.title;
			originalBody = result.body_md;
			sections = parseEditableSections(result.body_md);
			savedSections = body;
			renameOpen = false;
			toast.success('A lecke mentve');
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Nem sikerült menteni a leckét.';
			toast.error(formError);
		} finally { busy = false; }
	}

	async function deleteLesson() {
		if (busy) return;
		busy = true;
		formError = '';
		try {
			await editCurriculum({ action: 'deleteLesson', lessonId: lesson.id, levelId: lesson.levelId });
			savedSections = body;
			originalTitle = title;
			deleteOpen = false;
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
		if (busy) return;
		let id: string;
		do {
			id = `${editorId}-new-${nextSectionId++}`;
		} while (sections.some((section) => section.id === id));
		sections.push({ id, title: 'Új bekezdés', md: '', intro: false });
		await tick();
		const field = document.getElementById(`${editorId}-section-${id}`) as HTMLInputElement | null;
		field?.focus({ preventScroll: true });
		field?.select();
		field?.scrollIntoView({ block: 'center', behavior: 'instant' });
	}
</script>

<svelte:head><title>{title} szerkesztése | Leardy</title></svelte:head>
<svelte:window onbeforeunload={beforeUnload} />

<div class="editor-frame">
	<header class="flex items-start gap-3">
		<IconButton ariaLabel="Vissza a tananyag-szerkesztőhöz" size={44} disabled={busy} onclick={goBack}><ArrowLeft size={21} /></IconButton>
		<div class="min-w-0 flex-1">
			<h1 class="font-display break-words text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">{title}</h1>
			<p class="truncate text-xs text-stone-500 dark:text-stone-400">{lesson.levelTitle} · {lesson.materialTitle}</p>
		</div>
		<ActionMenu label="Lecke műveletei" disabled={busy} actions={[
			{ id: 'save', label: 'Mentés', icon: Save, promote: 'small', disabled: !dirty, onclick: () => { void save(); } },
			{ id: 'rename', label: 'Átnevezés', icon: Pencil, promote: 'small', iconOnly: true, onclick: openRename },
			{ id: 'delete', label: 'Törlés', icon: Trash2, promote: 'small', iconOnly: true, tone: 'danger', onclick: openDelete }
		]} />
	</header>

	<div class="mt-5 flex items-center justify-between gap-3">
		<h2 class="font-extrabold text-ink-900 dark:text-white">Bekezdések</h2>
	</div>
	<div class="mt-3 space-y-4">
		{#each sections as section, index (section.id)}
			<section class="rounded-3xl border border-stone-200 bg-white p-4 sm:p-5 dark:border-white/10 dark:bg-stone-900">
				<div class="mb-4 flex items-end gap-2">
					{#if section.intro}
						<span class="flex min-h-11 min-w-0 flex-1 items-center text-sm font-bold text-ink-900 dark:text-white">Bevezetés</span>
					{:else}
						<label class="block min-w-0 flex-1 text-sm font-bold text-ink-900 dark:text-white">Bekezdés címe<input id={`${editorId}-section-${section.id}`} class="{fieldClass} mt-1" bind:value={section.title} maxlength={160} disabled={busy} /></label>
					{/if}
					<ActionMenu compact label="Bekezdés műveletei: {section.title}" disabled={busy} actions={[
						{ id: 'down', label: 'Le', icon: ArrowDown, disabled: section.intro || index === sections.length - 1, onclick: () => move(index, 1) },
						{ id: 'up', label: 'Fel', icon: ArrowUp, disabled: section.intro || index === 0 || sections[index - 1]?.intro, onclick: () => move(index, -1) },
						{ id: 'delete', label: 'Törlés', icon: Trash2, tone: 'danger', onclick: () => { sections = sections.filter((item) => item.id !== section.id); } }
					]} />
				</div>
				<label class="block text-sm font-bold text-ink-900 dark:text-white">Tartalom<textarea class="{fieldClass} mt-1 min-h-48 resize-y text-sm leading-relaxed font-normal" bind:value={section.md} disabled={busy} placeholder="Írd ide a bekezdés tartalmát…" spellcheck="true"></textarea></label>
			</section>
		{:else}
			<div class="rounded-3xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">Még nincs bekezdés. Adj hozzá egyet a lecke megírásához.</div>
		{/each}
	</div>
	<button
		type="button"
		disabled={busy}
		onclick={() => { void addSection(); }}
		class="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-200 py-4 text-sm font-extrabold text-stone-400 transition hover:border-brand-300 hover:text-brand-600 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 dark:border-white/10 dark:text-stone-500 dark:hover:border-brand-500/50 dark:hover:text-white"
	>
		<Plus size={18} strokeWidth={2.75} aria-hidden="true" />
		Bekezdés hozzáadása
	</button>
	{#if formError && !renameOpen && !deleteOpen}<p role="alert" class="mt-4 text-sm text-red-600 dark:text-red-400">{formError}</p>{/if}
</div>

<Drawer open={renameOpen} label="Lecke átnevezése" title="Lecke átnevezése" onClose={() => { if (!busy) renameOpen = false; }}>
	<form class="mt-4 space-y-4" onsubmit={(event) => { event.preventDefault(); void save(rename); }}>
		<label class="block text-sm font-bold text-ink-900 dark:text-white">Lecke neve<input class="{fieldClass} mt-1" bind:value={rename} required maxlength={160} disabled={busy} /></label>
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
	onClose={() => { if (!busy) deleteOpen = false; }}
	onConfirm={() => { void deleteLesson(); }}
/>

<style>
	.editor-frame { container-type: inline-size; }
</style>

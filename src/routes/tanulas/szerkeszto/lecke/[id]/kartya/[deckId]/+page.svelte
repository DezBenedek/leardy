<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ArrowLeft, LoaderCircle, Save, Sparkles } from '@lucide/svelte';
	import { createBackNavigation } from '$lib/platform/back-navigation';
	import { editCurriculum } from '$lib/curriculum/curriculum-edit-api';
	import { deckCardKindLabel } from '$lib/curriculum/curriculum';
	import CardRowsEditor, { type CardEditorRow } from '$lib/components/CardRowsEditor.svelte';
	import AiCountPicker from '$lib/components/quiz/AiCountPicker.svelte';
	import AiFocusPicker, { type AiFocusId } from '$lib/components/quiz/AiFocusPicker.svelte';
	import AiSectionsPicker from '$lib/components/quiz/AiSectionsPicker.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { lessonSections } from '$lib/curriculum/lesson-content';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { invalidate } from '$lib/state/query.svelte';
	import type { PageData } from './$types';

	/* Hivatalos lecke csomag szerkesztője: a normál sor UI a lecke alatt.
	   Mentés egyetlen tananyag API hívással (teljes listás batch). */

	let { data }: { data: PageData } = $props();

	const initial = $derived((data.cards ?? []).map((c) => ({ id: c.id, front: c.front, back: c.back, sectionSlug: c.sectionSlug ?? '' })));
	const originalIds = $derived((data.cards ?? []).map((c) => c.id));
	let rows = $state<CardEditorRow[]>([]);
	let removedIds = $state<string[]>([]);
	let dirty = $state(false);
	let filledCount = $state(0);
	let saving = $state(false);
	let editor: { appendDrafts: (items: { front: string; back: string; sectionSlug?: string }[]) => void } | undefined = $state();
	let aiOpen = $state(false);
	let aiCount = $state(10);
	let aiSections = $state<string[]>([]);
	let aiFocus = $state<AiFocusId>('mixed');
	let aiBusy = $state(false);
	let aiError = $state('');
	let aiSkipped = $state(0);
	let aiDrafts = $state<{ front: string; back: string; sectionSlug: string; selected: boolean }[]>([]);
	const lessonSectionsList = $derived(lessonSections(data.lesson).filter((s) => !s.intro && s.title.trim()).map((s) => ({ slug: s.slug!, title: s.title.trim() })));

	const title = $derived(data.deck.title);
	const backUrl = $derived(resolve('/tanulas/szerkeszto/lecke/[id]', { id: data.lesson.id }));
	const goBack = createBackNavigation(() => backUrl, { direct: true });

	function frontBackLabels(kind: string): [string, string] {
		return kind === 'study' ? ['Kérdés', 'Válasz'] : ['Kifejezés', 'Definíció'];
	}
	const [frontLabel, backLabel] = $derived(frontBackLabels(data.deck.cardKind));

	beforeNavigate((navigation) => {
		if (saving) {
			navigation.cancel();
			return;
		}
		if (!dirty) return;
		if (navigation.willUnload || !confirm('Nem mentett módosítások vannak a csomagban. Elhagyod az oldalt?')) navigation.cancel();
	});
	function beforeUnload(event: BeforeUnloadEvent) {
		if (!dirty && !saving) return;
		event.preventDefault();
		event.returnValue = '';
	}

	function openAi() {
		if (saving) return;
		aiError = '';
		aiOpen = true;
	}
	async function generateAi() {
		if (aiBusy) return;
		aiBusy = true;
		aiError = '';
		aiSkipped = 0;
		try {
			const response = await fetch('/api/ai/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lessonId: data.lesson.id, kind: 'cards', count: aiCount, sectionSlugs: aiSections, focus: aiFocus })
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.message ?? result.error ?? 'Az AI generálás nem sikerült. Próbáld újra.');
			const list = Array.isArray(result.drafts) ? result.drafts : [];
			aiSkipped = typeof result.skipped === 'number' ? result.skipped : 0;
			aiDrafts = list.map((item: { front?: unknown; back?: unknown; sectionSlug?: unknown }) => ({
				front: String(item.front ?? ''),
				back: String(item.back ?? ''),
				sectionSlug: typeof item.sectionSlug === 'string' ? item.sectionSlug.trim().slice(0, 100) : '',
				selected: true
			}));
			if (!aiDrafts.length) aiError = 'Az AI nem adott értékelhető kártyát. Próbáld újra más bekezdéssel vagy darabszámmal.';
		} catch (e) {
			aiError = e instanceof Error ? e.message : 'Az AI generálás nem sikerült. Próbáld újra.';
		} finally {
			aiBusy = false;
		}
	}
	function insertAi() {
		const picked = aiDrafts.filter((item) => item.selected);
		if (!picked.length || saving) return;
		editor?.appendDrafts(picked.map((item) => ({ front: item.front, back: item.back, sectionSlug: item.sectionSlug })));
		aiDrafts = aiDrafts.filter((item) => !item.selected);
		aiOpen = false;
	}
	async function save() {
		if (saving) return;
		if (!dirty) {
			toast.success('Nincs változás.');
			return;
		}
		const norm = (s: string) => s.trim();
		for (const c of rows) {
			const f = norm(c.front);
			const b = norm(c.back);
			if ((f && !b) || (!f && b)) {
				toast.warning('Félbehagyott kártya', 'Minden kártya mindkét oldalát töltsd ki, vagy töröld a sort!');
				return;
			}
		}
		const filled = rows.filter((c) => norm(c.front) && norm(c.back));
		if (filled.length === 0) {
			toast.warning('Üres csomag', 'Adj meg legalább egy kitöltött kártyát!');
			return;
		}
		if (filled.length > 200) {
			toast.warning('Betelt a csomag', 'Legfeljebb 200 kártya lehet egy csomagban.');
			return;
		}
		saving = true;
		try {
			const result = await editCurriculum<{ ids: string[] }>({
				action: 'saveLessonDeckCards',
				levelId: data.lesson.levelId,
				lessonId: data.lesson.id,
				deckId: data.deck.id,
				originalIds,
				cards: filled.map((c) => ({
					id: c.id ?? '',
					front: norm(c.front),
					back: norm(c.back),
					sectionSlug: c.sectionSlug
				}))
			});
			const ids = result.ids ?? [];
			let k = 0;
			for (const c of rows) {
				if (norm(c.front) && norm(c.back)) {
					c.id = ids[k++] ?? c.id;
					c.front = norm(c.front);
					c.back = norm(c.back);
					c.orig = { front: c.front, back: c.back, section: c.sectionSlug };
				}
			}
			removedIds = [];
			invalidate(`package:deck:${data.deck.id}`);
			toast.success('Mentve.');
			void goto(backUrl);
		} catch (e) {
			toast.error('Nem sikerült menteni', e instanceof Error ? e.message : 'Hiba történt.');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>{title} - Szerkesztés | Leardy</title></svelte:head>
<svelte:window onbeforeunload={beforeUnload} />

{#if !data.deck}
	<EmptyState title="Nincs ilyen csomag" description="Ezt a csomagot törölték, vagy soha nem létezett." />
{:else}
	<div class="flex items-center gap-2">
		<IconButton ariaLabel="Vissza a lecke szerkesztéséhez" size={44} disabled={saving} onclick={goBack}>
			<ArrowLeft size={21} />
		</IconButton>
		<div class="min-w-0 flex-1">
			<h1 class="font-display truncate text-[22px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
				{title}
			</h1>
			<p class="truncate text-xs text-stone-500 dark:text-stone-400">
				{data.lesson.title} · {deckCardKindLabel(data.deck.cardKind)}
			</p>
		</div>
		<IconButton
			ariaLabel="Mentés"
			title={dirty ? 'Mentés' : 'Nincs változás'}
			size={44}
			disabled={!dirty || saving}
			onclick={() => void save()}
		>
			<Save size={20} />
		</IconButton>
	</div>

	<div class="mt-4 flex items-center gap-2 px-1">
		<h2 class="font-display min-w-0 flex-1 text-[17px] font-extrabold tracking-tight text-ink-900 dark:text-white">
			Kártyák · {filledCount}
		</h2>
		<Button size="sm" variant="ghost" ariaLabel="AI generálás" disabled={saving} onclick={openAi}><Sparkles size={17} aria-hidden="true" /><span class="hidden sm:inline">AI generálás</span></Button>
		{#if dirty}
			<span class="shrink-0 rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] font-extrabold text-amber-600 uppercase dark:text-amber-300">
				Módosítva
			</span>
		{/if}
		<span class="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 uppercase dark:text-emerald-300">
			Hivatalos
		</span>
	</div>

	<div class="mt-2">
		<CardRowsEditor
			bind:this={editor}
			bind:rows
			bind:removedIds
			{initial}
			disabled={saving}
			{frontLabel}
			{backLabel}
			onDirtyChange={(value) => (dirty = value)}
			onCountChange={(value) => (filledCount = value)}
		/>
	</div>

	<Sheet open={aiOpen} label="AI generálás" title="AI generálás" onClose={() => { if (!aiBusy) aiOpen = false; }}>
		<div class="mt-4 space-y-4">
			<AiCountPicker bind:value={aiCount} max={20} disabled={aiBusy} />
			<AiSectionsPicker bind:selected={aiSections} sections={lessonSectionsList} disabled={aiBusy} />
			<AiFocusPicker bind:value={aiFocus} disabled={aiBusy} />
			{#if aiError}<p role="alert" class="text-sm text-red-600 dark:text-red-400">{aiError}</p>{/if}
			<Button block busy={aiBusy} disabled={aiBusy} onclick={() => void generateAi()}>Generálás</Button>
			{#if aiBusy}
				<p role="status" class="flex items-center gap-2 text-sm font-medium text-stone-500 dark:text-stone-400"><LoaderCircle size={17} class="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Generálás folyamatban, ez akár egy percig is tarthat.</p>
			{/if}
			{#if aiDrafts.length > 0}
				<div class="border-t border-stone-200 pt-3 dark:border-white/10">
					<p class="text-xs font-bold text-stone-500 dark:text-stone-400">
						{aiDrafts.filter((item) => item.selected).length} / {aiDrafts.length} kiválasztva{#if aiSkipped > 0} · {aiSkipped} hibás sor kimaradt{/if}
					</p>
					<ul class="mt-2 space-y-1.5">
						{#each aiDrafts as item, index (index)}
							<li>
								<button
									type="button"
									aria-pressed={item.selected}
									disabled={aiBusy}
									onclick={() => (item.selected = !item.selected)}
									class={['flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] disabled:opacity-60', item.selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
								>
									<span class={['grid size-6 shrink-0 place-items-center rounded-lg text-sm font-extrabold', item.selected ? 'bg-brand-500 text-white' : 'bg-stone-200 text-stone-500 dark:bg-white/10 dark:text-stone-300']}>{item.selected ? '✓' : index + 1}</span>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-[14px] font-bold text-ink-900 dark:text-white">{item.front || 'Névtelen kártya'}</span>
										<span class="block truncate text-[11px] text-stone-500 dark:text-stone-400">{item.back}</span>
									</span>
								</button>
							</li>
						{/each}
					</ul>
					<div class="mt-3 flex flex-wrap justify-end gap-2">
						<Button busy={aiBusy} disabled={aiBusy || !aiDrafts.some((item) => item.selected)} onclick={insertAi}>Hozzáadás a csomaghoz</Button>
					</div>
				</div>
			{/if}
		</div>
	</Sheet>
{/if}

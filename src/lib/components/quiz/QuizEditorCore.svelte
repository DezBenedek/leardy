<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import { ArrowDown, ArrowUp, Copy, Eye, LayoutTemplate, LoaderCircle, Menu, Pencil, Sparkles, Trash2 } from '@lucide/svelte';
	import AddItemButton from '$lib/ui/AddItemButton.svelte';
	import { readSettings } from '$lib/question-types/settings';
	import { typeComponents } from '$lib/question-types/components';
	import Button from '$lib/ui/Button.svelte';
	import ActionMenu from '$lib/ui/ActionMenu.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Drawer from '../Drawer.svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';
	import QuizModal from '../QuizModal.svelte';
	import QuizRunner from '../QuizRunner.svelte';
	import QuestionForm from './QuestionForm.svelte';
	import QuestionTypeSheet from './QuestionTypeSheet.svelte';
	import TemplateSheet from './TemplateSheet.svelte';
	import AiCountPicker from './AiCountPicker.svelte';
	import AiFocusPicker, { type AiFocusId } from './AiFocusPicker.svelte';
	import AiSectionsPicker from './AiSectionsPicker.svelte';
	import type { QuizAdapter } from './quiz-adapter';
	import {
		blankQuestion, deleteCustomTemplate, draftToPreview, effectiveSectionSlug, loadCustomTemplates,
		questionTypeTitle, saveCustomTemplate, seedToDraft, validateQuestion,
		type CustomTemplate, type QuestionDraft, type QuestionTypeId, type SectionOption, type TemplateSeed
	} from '$lib/quiz/quiz-editor';
	import type { EditorQuiz } from '$lib/curriculum/curriculum-editor';
	import type { QuizQuestion } from '$lib/curriculum/curriculum';
	import { toast } from '$lib/state/toast.svelte';

	interface Props {
		adapter: QuizAdapter;
		sections: SectionOption[];
		initialQuizzes: EditorQuiz[];
		lessonId?: string;
		header?: Snippet<[Snippet]>;
		onCountChange?: (total: number) => void;
		onDirtyChange?: (dirty: boolean) => void;
		onBusyChange?: (busy: boolean) => void;
	}
	let { adapter, sections, initialQuizzes, lessonId = '', header, onCountChange, onDirtyChange, onBusyChange }: Props = $props();

	const initial = untrack(() => [...initialQuizzes]);
	let questions = $state<QuestionDraft[]>(initial.flatMap((quiz) => [...quiz.questions]
		.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
		.map((q) => ({ id: q.id, quizId: quiz.id, question_text: q.question_text, imageUrl: q.imageUrl, settings: readSettings(q.settings), type: q.type,
			options: [...q.options], pairs: q.pairs.map((p) => ({ ...p })), correct_answer: q.correct_answer,
			sectionSlug: effectiveSectionSlug(q.sectionSlug, quiz.section_slug), sort: q.sort }))));
	let quizId = $state(initial.at(0)?.id ?? '');
	let busy = $state(false);
	let imageUploading = $state(false);
	let templateBusy = $state(false);
	let templateError = $state('');
	const editorBusy = $derived(busy || imageUploading || templateBusy);
	let listError = $state('');
	let editing = $state<QuestionDraft | null>(null);
	let editingBaseline = $state('');
	let formError = $state('');
	let typeSheetOpen = $state(false);
	let templateSheetOpen = $state(false);
	let customTemplates = $state<CustomTemplate[]>([]);
	let preview = $state<{ title: string; questions: QuizQuestion[] } | null>(null);
	let pending = $state<{ title: string; description: string; label: string; action: () => void } | null>(null);
	let aiOpen = $state(false);
	let aiCount = $state(6);
	let aiSections = $state<string[]>([]);
	let aiFocus = $state<AiFocusId>('mixed');
	let aiDifficulty = $state<'easy' | 'normal' | 'hard'>('normal');
	let aiBusy = $state(false);
	let aiError = $state('');
	let aiSkipped = $state(0);
	let aiDrafts = $state<{ draft: QuestionDraft; selected: boolean }[]>([]);
	const aiEditorBusy = $derived(editorBusy || aiBusy);
	let listElement: HTMLUListElement | undefined = $state();
	// Minden típus saját piszkozatot őriz, így a váltás visszafordítható.
	let typeDrafts: Partial<Record<QuestionTypeId, QuestionDraft>> = {};
	let dirty = $derived(editing !== null && (JSON.stringify(editing) !== editingBaseline || (!editing.id && !!editing.question_text.trim())));

	$effect(() => { onCountChange?.(questions.length); });
	$effect(() => { onDirtyChange?.(dirty); });
	$effect(() => { onBusyChange?.(editorBusy); });

	function sectionTitle(slug: string) {
		return sections.find((section) => section.slug === slug)?.title ?? (slug ? 'Hiányzó bekezdés' : 'Teljes lecke');
	}
	function clone(draft: QuestionDraft): QuestionDraft {
		return { ...draft, settings: readSettings(draft.settings), options: [...draft.options], pairs: draft.pairs.map((pair) => ({ ...pair })) };
	}
	async function run<T>(task: () => Promise<T>): Promise<{ value: T } | null> {
		if (editorBusy) return null;
		busy = true;
		listError = '';
		try { return { value: await task() }; }
		catch (err) {
			listError = err instanceof Error ? err.message : 'Nem sikerült menteni a módosítást. Próbáld újra.';
			return null;
		} finally { busy = false; }
	}
	function startEdit(draft: QuestionDraft) {
		if (editorBusy) return;
		editing = clone(draft);
		editingBaseline = JSON.stringify(editing);
		formError = '';
		typeDrafts = {};
	}
	function pickType(type: QuestionTypeId) {
		if (editorBusy) return;
		typeSheetOpen = false;
		if (!editing) { startEdit(blankQuestion(quizId, type, questions.length)); return; }
		if (editing.type === type) return;
		typeDrafts[editing.type as QuestionTypeId] = clone(editing);
		const saved = typeDrafts[type] ?? blankQuestion(editing.quizId, type, editing.sort);
		editing = { ...clone(saved), id: editing.id, question_text: editing.question_text, imageUrl: editing.imageUrl, sectionSlug: editing.sectionSlug };
		formError = '';
	}
	function backFromEdit() {
		if (editorBusy) return;
		const discard = () => { editing = null; formError = ''; typeDrafts = {}; };
		if (!dirty) { discard(); return; }
		pending = { title: 'Elveted a módosításokat?', description: 'A kérdés nem mentett változtatásai elvesznek. A szerkesztést is folytathatod.', label: 'Módosítások elvetése', action: discard };
	}
	function canCloseEditor() {
		if (editorBusy) return false;
		if (dirty) { backFromEdit(); return false; }
		return true;
	}
	async function openTemplates() {
		if (editorBusy) return;
		customTemplates = [];
		templateSheetOpen = true;
		templateBusy = true;
		templateError = '';
		try { customTemplates = await loadCustomTemplates(); }
		catch (err) { templateError = err instanceof Error ? err.message : 'A sablonok betöltése nem sikerült. Próbáld újra.'; }
		finally { templateBusy = false; }
	}
	async function removeTemplate(key: string) {
		if (editorBusy) return;
		templateBusy = true;
		templateError = '';
		try { customTemplates = await deleteCustomTemplate(key); }
		catch (err) { templateError = err instanceof Error ? err.message : 'A sablon törlése nem sikerült. Próbáld újra.'; }
		finally { templateBusy = false; }
	}
	function applyTemplate(seed: TemplateSeed) {
		if (editorBusy) return;
		templateSheetOpen = false;
		const apply = () => {
			const fresh = seedToDraft(seed, editing?.quizId || quizId, editing?.sort ?? questions.length);
			if (editing) { editing = { ...fresh, id: editing.id, sectionSlug: editing.sectionSlug }; }
			else { startEdit(fresh); }
			formError = '';
			typeDrafts = {};
		};
		if (dirty) {
			pending = { title: 'Betöltöd a sablont?', description: 'A sablon lecseréli a kérdés szövegét és válaszait. A bekezdéskapcsolat megmarad.', label: 'Sablon betöltése', action: apply };
		} else apply();
	}
	async function saveCurrentAsTemplate() {
		if (!editing || editorBusy) return;
		const problem = validateQuestion(editing);
		if (problem) { formError = problem; return; }
		const seed: TemplateSeed = { type: editing.type as QuestionTypeId, title: editing.question_text.trim().slice(0, 40),
			subtitle: questionTypeTitle(editing.type), question_text: editing.question_text.trim(), imageUrl: editing.imageUrl, settings: readSettings(editing.settings), options: [...editing.options],
			pairs: editing.pairs.map((pair) => ({ ...pair })), correct_answer: editing.correct_answer };
		templateBusy = true;
		formError = '';
		try { customTemplates = await saveCustomTemplate(seed); toast.success('Sablon mentve a fiókodba'); }
		catch (err) { formError = err instanceof Error ? err.message : 'A sablon mentése nem sikerült. Próbáld újra.'; }
		finally { templateBusy = false; }
	}
	async function focusQuestion(id: string) {
		await tick();
		listElement?.querySelector<HTMLButtonElement>(`[data-question-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: false });
	}
	async function saveEditing() {
		if (!editing || editorBusy) return;
		const problem = validateQuestion(editing);
		if (problem) { formError = problem; return; }
		const draft = clone(editing);
		busy = true;
		formError = '';
		try {
			// A kvíz lusta létrehozása ugyanahhoz a mentési művelethez tartozik.
			if (!quizId) quizId = (await adapter.ensureQuiz()).id;
			const targetQuizId = draft.quizId || quizId;
			const saved = await adapter.saveQuestion(targetQuizId, draft, draft.id || undefined);
			const normalized = { ...draft, ...draftToPreview(draft), id: saved.id, quizId: targetQuizId };
			questions = draft.id ? questions.map((q) => q.id === draft.id ? normalized : q) : [...questions, normalized];
			editing = null;
			typeDrafts = {};
			toast.success(draft.id ? 'Kérdés mentve' : 'Kérdés hozzáadva');
			void focusQuestion(saved.id);
		} catch (err) { formError = err instanceof Error ? err.message : 'Nem sikerült menteni a kérdést. Próbáld újra.'; }
		finally { busy = false; }
	}
	function previewEditing() {
		if (!editing) return;
		const problem = validateQuestion(editing);
		if (problem) { formError = problem; return; }
		formError = '';
		preview = { title: 'Kérdés előnézete', questions: [draftToPreview(editing)] };
	}
	function previewAll() {
		const invalid = questions.findIndex((q) => validateQuestion(q));
		if (invalid >= 0) { startEdit(questions[invalid]); formError = validateQuestion(questions[invalid]) ?? ''; return; }
		preview = { title: 'Kvíz előnézete', questions: questions.map(draftToPreview) };
	}
	async function duplicateQuestionRow(source: QuestionDraft) {
		const result = await run(() => adapter.duplicateQuestion(source.id));
		if (!result) return;
		const index = questions.findIndex((q) => q.id === source.id);
		questions = [...questions.slice(0, index + 1), { ...clone(source), id: result.value.id }, ...questions.slice(index + 1)];
		toast.success('Kérdés másolva');
		void focusQuestion(result.value.id);
	}
	async function moveQuestionRow(id: string, delta: number) {
		if (editorBusy || !quizId) return;
		const index = questions.findIndex((q) => q.id === id);
		const target = index + delta;
		if (index < 0 || target < 0 || target >= questions.length) return;
		const next = [...questions];
		[next[index], next[target]] = [next[target], next[index]];
		const result = await run(() => adapter.reorderQuestions(quizId, next.map((q) => q.id)));
		if (!result) return;
		questions = next.map((q, sort) => ({ ...q, sort }));
		void focusQuestion(id);
	}
	function requestDelete(question: QuestionDraft) {
		pending = { title: 'Törlöd a kérdést?', description: `„${question.question_text}” véglegesen törlődik a leckéből.`, label: 'Kérdés törlése', action: () => void deleteQuestionRow(question.id) };
	}
	function openAi() {
		if (aiEditorBusy) return;
		aiError = '';
		aiOpen = true;
	}
	function aiSectionTitle(slug: string): string {
		return sections.find((section) => section.slug === slug)?.title ?? 'Teljes lecke';
	}
	async function generateAi() {
		if (aiBusy || !lessonId) return;
		aiBusy = true;
		aiError = '';
		aiSkipped = 0;
		try {
			const response = await fetch('/api/ai/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lessonId, kind: 'quiz', count: aiCount, sectionSlugs: aiSections, difficulty: aiDifficulty, focus: aiFocus })
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.message ?? result.error ?? 'Az AI generálás nem sikerült. Próbáld újra.');
			const list = Array.isArray(result.drafts) ? result.drafts : [];
			aiSkipped = typeof result.skipped === 'number' ? result.skipped : 0;
			aiDrafts = list.map((item: { type: string; question_text: string; options: string[]; correct_answer: string; sectionSlug?: string }, index: number) => ({
				draft: {
					...seedToDraft(
						{
							type: (['choice', 'tf', 'text'].includes(item.type) ? item.type : 'text') as QuestionTypeId,
							title: '',
							subtitle: '',
							question_text: String(item.question_text ?? ''),
							options: Array.isArray(item.options) ? item.options.map((o: unknown) => String(o ?? '')) : [],
							pairs: [],
							correct_answer: String(item.correct_answer ?? '')
						},
						quizId,
						questions.length + index
					),
					sectionSlug: typeof item.sectionSlug === 'string' ? item.sectionSlug.trim().slice(0, 100) : ''
				},
				selected: true
			}));
			if (!aiDrafts.length) aiError = 'Az AI nem adott értékelhető kérdést. Próbáld újra más bekezdéssel vagy darabszámmal.';
		} catch (err) {
			aiError = err instanceof Error ? err.message : 'Az AI generálás nem sikerült. Próbáld újra.';
		} finally {
			aiBusy = false;
		}
	}
	function previewAi() {
		const picked = aiDrafts.filter((item) => item.selected).map((item) => item.draft);
		if (!picked.length) return;
		const invalid = picked.findIndex((draft) => validateQuestion(draft));
		if (invalid >= 0) {
			aiError = `A ${invalid + 1}. kiválasztott kérdés hibás: ${validateQuestion(picked[invalid]) ?? ''}`;
			return;
		}
		aiError = '';
		preview = { title: 'AI kérdések előnézete', questions: picked.map(draftToPreview) };
	}
	async function insertAi() {
		const picked = aiDrafts.filter((item) => item.selected).map((item) => item.draft);
		if (!picked.length || aiEditorBusy) return;
		busy = true;
		aiError = '';
		try {
			const saved = await adapter.saveQuestions(picked);
			const fresh = saved.ids.map((id, index) => ({ ...clone(picked[index]), id, quizId: saved.quizId, sort: questions.length + index }));
			if (!quizId) quizId = saved.quizId;
			questions = [...questions, ...fresh];
			aiDrafts = aiDrafts.filter((item) => !item.selected);
			aiOpen = false;
			toast.success(`${fresh.length} kérdés beszúrva`);
			if (fresh.length) void focusQuestion(fresh[fresh.length - 1].id);
		} catch (err) {
			aiError = err instanceof Error ? err.message : 'Nem sikerült beszúrni a kérdéseket. Próbáld újra.';
		} finally {
			busy = false;
		}
	}
	async function deleteQuestionRow(id: string) {
		const index = questions.findIndex((q) => q.id === id);
		const result = await run(() => adapter.deleteQuestion(id));
		if (!result) return;
		questions = questions.filter((q) => q.id !== id);
		toast.success('Kérdés törölve');
		if (questions.length) void focusQuestion(questions[Math.min(index, questions.length - 1)].id);
	}
</script>

{#snippet actions()}
	<div class="flex shrink-0 items-center gap-1 sm:gap-2">
		<ActionMenu compact triggerIcon={Menu} label="Kvíz műveletei" disabled={aiEditorBusy} actions={[
			{ id: 'preview', label: 'Előnézet', icon: Eye, disabled: !questions.length, onclick: previewAll },
			{ id: 'templates', label: 'Sablonok', icon: LayoutTemplate, onclick: openTemplates },
			...(lessonId ? [{ id: 'ai', label: 'AI generálás', icon: Sparkles, onclick: openAi }] : [])
		]} />
	</div>
{/snippet}

<div class="quiz-editor" aria-busy={editorBusy}>
	{#if header}{@render header(actions)}{:else}<div class="mb-3 flex justify-end">{@render actions()}</div>{/if}
	{#if !questions.length}
		<p class="mb-3 rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">Még nincs kérdés. Adj hozzá egyet a kvíz elkészítéséhez.</p>
	{:else}
		<ul bind:this={listElement} class="mb-3 space-y-1.5" aria-label="A lecke kérdései">
			{#each questions as question, index (question.id)}
				{@const Icon = typeComponents(question.type).icon}
				{@const invalid = validateQuestion(question)}
				<li class="flex items-center gap-1 rounded-2xl border border-stone-200 px-2 py-1.5 dark:border-white/10">
					<button type="button" data-question-id={question.id} aria-label="{index + 1}. kérdés szerkesztése: {question.question_text || 'Névtelen kérdés'}" disabled={editorBusy} onclick={() => startEdit(question)} class="question-open flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl text-left disabled:opacity-60">
						<span class="w-5 shrink-0 text-center text-xs font-bold text-stone-400 tabular-nums">{index + 1}</span>
						<span class="min-w-0 flex-1">
							<span class="line-clamp-2 block text-sm leading-5 font-bold break-words text-ink-900 dark:text-white">{question.question_text || 'Névtelen kérdés'}</span>
							<span class="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400"><Icon size={12} class="shrink-0" aria-hidden="true" /><span class="truncate">{questionTypeTitle(question.type)}{#if question.sectionSlug} · {sectionTitle(question.sectionSlug)}{/if}</span></span>
							{#if invalid}<span class="block text-[11px] text-amber-700 dark:text-amber-300">{invalid}</span>{/if}
						</span>
					</button>
					<ActionMenu compact floating label={`${index + 1}. kérdés műveletei`} disabled={editorBusy} actions={[
						{ id: 'edit', label: 'Szerkesztés', icon: Pencil, onclick: () => startEdit(question) },
						{ id: 'preview', label: 'Előnézet', icon: Eye, disabled: !!invalid, onclick: () => (preview = { title: 'Kérdés előnézete', questions: [draftToPreview(question)] }) },
						{ id: 'copy', label: 'Másolás', icon: Copy, onclick: () => void duplicateQuestionRow(question) },
						{ id: 'up', label: 'Feljebb', icon: ArrowUp, disabled: index === 0, onclick: () => void moveQuestionRow(question.id, -1) },
						{ id: 'down', label: 'Lejjebb', icon: ArrowDown, disabled: index === questions.length - 1, onclick: () => void moveQuestionRow(question.id, 1) },
						{ id: 'delete', label: 'Törlés', icon: Trash2, tone: 'danger', onclick: () => requestDelete(question) }
					]} />
				</li>
			{/each}
		</ul>
	{/if}
	<AddItemButton label="Kérdés hozzáadása" disabled={editorBusy} onclick={() => (typeSheetOpen = true)} />
	{#if listError}<p role="alert" class="mt-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{listError}</p>{/if}
</div>

<Drawer open={editing !== null} title={editing?.id ? 'Kérdés szerkesztése' : 'Új kérdés'} label="Kérdés szerkesztése" wide
	canClose={canCloseEditor} onClose={backFromEdit}>
	{#if editing}
		{#key editing}
			<QuestionForm bind:draft={editing} {sections} saving={editorBusy} {imageUploading} error={formError} onChange={() => (formError = '')}
				uploadImage={adapter.uploadImage} onImageBusyChange={(value) => (imageUploading = value)}
				onPickType={() => (typeSheetOpen = true)} onPickTemplate={openTemplates} onSaveTemplate={saveCurrentAsTemplate}
				onSave={() => void saveEditing()} onPreview={previewEditing} />
		{/key}
	{/if}
</Drawer>

<QuestionTypeSheet open={typeSheetOpen} value={editing?.type ?? ''} onClose={() => (typeSheetOpen = false)} onPick={pickType} />
<TemplateSheet open={templateSheetOpen} custom={customTemplates} busy={templateBusy} error={templateError}
	onRetry={openTemplates}
	onClose={() => (templateSheetOpen = false)} onPick={applyTemplate} onDeleteCustom={removeTemplate} />
{#if lessonId}
	<Sheet open={aiOpen} label="AI generálás" title="AI generálás" onClose={() => { if (!aiBusy) aiOpen = false; }}>
		<div class="mt-4 space-y-4">
			<AiCountPicker bind:value={aiCount} max={10} disabled={aiBusy} />
			<AiSectionsPicker bind:selected={aiSections} {sections} disabled={aiBusy} />
			<AiFocusPicker bind:value={aiFocus} disabled={aiBusy} />
			<div>
				<p class="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Nehézség</p>
				<div class="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Kérdések nehézsége">
					{#each [{ id: 'easy', label: 'Könnyű' }, { id: 'normal', label: 'Közepes' }, { id: 'hard', label: 'Nehéz' }] as d (d.id)}
						<button
							type="button"
							aria-pressed={aiDifficulty === d.id}
							disabled={aiBusy}
							onclick={() => (aiDifficulty = d.id as 'easy' | 'normal' | 'hard')}
							class={['rounded-xl px-3.5 py-2 text-sm font-extrabold transition active:scale-[0.97] disabled:opacity-60', aiDifficulty === d.id ? 'bg-brand-500 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-white/10 dark:text-stone-300 dark:hover:bg-white/15']}
						>{d.label}</button>
					{/each}
				</div>
			</div>
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
										<span class="block truncate text-[14px] font-bold text-ink-900 dark:text-white">{item.draft.question_text || 'Névtelen kérdés'}</span>
										<span class="block truncate text-[11px] text-stone-500 dark:text-stone-400">{questionTypeTitle(item.draft.type)}{item.draft.sectionSlug ? ` · ${aiSectionTitle(item.draft.sectionSlug)}` : ''}</span>
									</span>
								</button>
							</li>
						{/each}
					</ul>
					<div class="mt-3 flex flex-wrap justify-end gap-2">
						<Button variant="outline" disabled={aiBusy || !aiDrafts.some((item) => item.selected)} onclick={previewAi}>Előnézet</Button>
						<Button busy={aiBusy} disabled={aiBusy || !aiDrafts.some((item) => item.selected)} onclick={() => void insertAi()}>Beszúrás</Button>
					</div>
				</div>
			{/if}
		</div>
	</Sheet>
{/if}
<div use:portal>
	<Sheet open={pending !== null} label={pending?.title ?? 'Megerősítés'} title={pending?.title} onClose={() => (pending = null)}>
		{#if pending}
			<p class="mt-3 text-sm leading-6 break-words text-stone-500 dark:text-stone-400">{pending.description}</p>
			<div class="mt-5 flex flex-wrap justify-end gap-2">
				<Button variant="outline" onclick={() => (pending = null)}>Mégse</Button>
				<Button variant="danger" onclick={() => { const action = pending?.action; pending = null; action?.(); }}>{pending.label}</Button>
			</div>
		{/if}
	</Sheet>
	<QuizModal open={preview !== null} label={preview?.title ?? 'Előnézet'} title={preview?.title} onClose={() => (preview = null)}>
		{#if preview}<QuizRunner questions={preview.questions} title={preview.title} onExit={() => (preview = null)} />{/if}
	</QuizModal>
</div>

<style>
	.quiz-editor :global(button:focus-visible) { outline: 2px solid var(--color-brand-500); outline-offset: 3px; }
	.question-open:hover { color: var(--color-brand-600); }
</style>

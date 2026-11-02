<script lang="ts">
	/* JSON-betöltés a leckeszerkesztőbe: bekezdések a szerkesztőbe kerülnek
	   (mentésig piszkozat), a kvíz és a csomagok azonnal a szerverre. */
	import { FileUp } from '@lucide/svelte';
	import Drawer from './Drawer.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { createLessonQuizAdapter } from './quiz/quiz-adapter';
	import { editCurriculum } from '$lib/curriculum/curriculum-edit-api';
	import {
		importSectionsToContent,
		parseLessonJsonImport,
		type LessonJsonImport
	} from '$lib/curriculum/lesson-json-import';
	import type { LessonContentSection } from '$lib/curriculum/lesson-content';
	import type { EditorLesson } from '$lib/curriculum/curriculum-editor';
	import { toast } from '$lib/state/toast.svelte';

	interface Props {
		open: boolean;
		lesson: EditorLesson;
		onClose: () => void;
		onAppendSections: (sections: LessonContentSection[]) => void;
		onTitleImported: (title: string) => void;
		onQuizImported: (count: number) => void;
		onDecksImported: (packs: number, cards: number) => void;
	}

	let { open, lesson, onClose, onAppendSections, onTitleImported, onQuizImported, onDecksImported }: Props = $props();

	let jsonText = $state('');
	let fileName = $state('');
	let doTitle = $state(true);
	let doSections = $state(true);
	let doQuiz = $state(true);
	let doDecks = $state(true);
	let busy = $state(false);
	let progress = $state('');
	let fileInput: HTMLInputElement | null = $state(null);

	type Parsed = { ok: true; value: LessonJsonImport } | { ok: false; message: string };
	let result = $derived.by((): Parsed | null => {
		const text = jsonText.trim();
		if (!text) return null;
		try {
			return { ok: true, value: parseLessonJsonImport(text) };
		} catch (e) {
			return { ok: false, message: e instanceof Error ? e.message : 'Érvénytelen JSON.' };
		}
	});
	let value = $derived(result && result.ok ? result.value : null);
	let deckCards = $derived(value ? value.decks.reduce((n, d) => n + d.cards.length, 0) : 0);

	function summary(v: LessonJsonImport): string {
		const parts: string[] = [];
		if (v.title) parts.push('új cím');
		if (v.sections.length) parts.push(`${v.sections.length} bekezdés`);
		if (v.decks.length) parts.push(`${v.decks.length} csomag (${v.decks.reduce((n, d) => n + d.cards.length, 0)} kártya)`);
		if (v.questions.length) parts.push(`${v.questions.length} kérdés`);
		return parts.join(' · ');
	}

	async function pickFile() {
		fileInput?.click();
	}

	async function onFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement | null;
		const file = input?.files?.[0];
		if (input) input.value = '';
		if (!file) return;
		if (file.size > 2_000_000) {
			toast.error('Túl nagy fájl', 'Legfeljebb 2 MB-os JSON tölthető be.');
			return;
		}
		try {
			jsonText = await file.text();
			fileName = file.name;
		} catch {
			toast.error('Nem olvasható a fájl.');
		}
	}

	async function runImport() {
		if (!value || busy) return;
		const useTitle = doTitle && !!value.title;
		const useSections = doSections && value.sections.length > 0;
		const useQuiz = doQuiz && value.questions.length > 0;
		const useDecks = doDecks && value.decks.length > 0;
		if (!useTitle && !useSections && !useQuiz && !useDecks) {
			toast.warning('Nincs kiválasztva', 'Jelölj be legalább egy betöltendő részt.');
			return;
		}
		busy = true;
		try {
			if (useTitle && value.title) onTitleImported(value.title);
			if (useSections) {
				progress = 'Bekezdések hozzáadása…';
				onAppendSections(importSectionsToContent(value.sections));
			}
			if (useQuiz) {
				const adapter = createLessonQuizAdapter(lesson.levelId, lesson.id);
				for (let i = 0; i < value.questions.length; i += 20) {
					progress = `Kvíz mentése… (${Math.min(i + 20, value.questions.length)}/${value.questions.length})`;
					await adapter.saveQuestions(value.questions.slice(i, i + 20));
				}
				onQuizImported(value.questions.length);
			}
			if (useDecks) {
				let cards = 0;
				for (let i = 0; i < value.decks.length; i++) {
					const deck = value.decks[i];
					progress = `Csomag mentése… (${i + 1}/${value.decks.length})`;
					const created = await editCurriculum<{ id: string }>({
						action: 'createLessonDeck', levelId: lesson.levelId, lessonId: lesson.id, title: deck.title
					});
					await editCurriculum({
						action: 'saveLessonDeckCards', levelId: lesson.levelId, lessonId: lesson.id,
						deckId: created.id, cards: deck.cards.map((c) => ({ front: c.front, back: c.back, sectionSlug: '' }))
					});
					cards += deck.cards.length;
				}
				onDecksImported(value.decks.length, cards);
			}
			const done: string[] = [];
			if (useTitle) done.push('cím átírva');
			if (useSections) done.push(`${value.sections.length} bekezdés (mentsd a leckét)`);
			if (useQuiz) done.push(`${value.questions.length} kérdés mentve`);
			if (useDecks) done.push(`${value.decks.length} csomag, ${deckCards} kártya mentve`);
			toast.success('Importálás kész', done.join(' · '));
			jsonText = '';
			fileName = '';
			onClose();
		} catch (e) {
			toast.error('Nem sikerült az importálás', e instanceof Error ? e.message : 'Próbáld újra.');
		} finally {
			busy = false;
			progress = '';
		}
	}
</script>

<Drawer {open} label="Importálás JSON-ból" title="Importálás JSON-ból" {onClose} wide>
	<div class="mt-1 grid gap-3">
		<div class="flex gap-2">
			<button
				type="button"
				onclick={pickFile}
				disabled={busy}
				class="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 px-4 py-3 text-[14px] font-bold text-stone-600 transition active:scale-[0.99] disabled:opacity-50 dark:border-white/15 dark:text-stone-300"
			>
				<FileUp size={18} />
				{fileName || 'JSON-fájl választása'}
			</button>
			<input bind:this={fileInput} type="file" accept=".json,application/json" onchange={onFile} class="hidden" aria-label="JSON-fájl választása" />
		</div>
		<label class="block text-[13px] font-bold">
			<span class="mb-1 block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Vagy illeszd be a JSON-t</span>
			<textarea
				bind:value={jsonText}
				rows={8}
				spellcheck={false}
				disabled={busy}
				placeholder={'{\n  "sections": [{ "title": "Bekezdés", "body": "Markdown…" }],\n  "decks": [{ "title": "Csomag", "cards": [{ "front": "…", "back": "…" }] }],\n  "quiz": [{ "type": "choice", "question": "…", "options": ["a", "b"], "answer": "a" }]\n}'}
				class="w-full rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-[12px] outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/10 dark:bg-stone-950"
			></textarea>
		</label>
		{#if result}
			{#if result.ok && value}
				<p role="status" class="rounded-xl bg-emerald-500/10 px-3 py-2 text-[13px] font-bold text-emerald-700 dark:text-emerald-300">{summary(value)}</p>
				<div class="grid gap-1.5">
					{#if value.title}
						<label class="flex cursor-pointer items-center justify-between gap-2 rounded-2xl border border-stone-200 px-4 py-2.5 text-[14px] font-bold dark:border-white/10">
							Leckecím: {value.title}
							<input type="checkbox" bind:checked={doTitle} disabled={busy} class="size-4 accent-brand-500" />
						</label>
					{/if}
					{#if value.sections.length > 0}
						<label class="flex cursor-pointer items-center justify-between gap-2 rounded-2xl border border-stone-200 px-4 py-2.5 text-[14px] font-bold dark:border-white/10">
							Bekezdések ({value.sections.length})
							<input type="checkbox" bind:checked={doSections} disabled={busy} class="size-4 accent-brand-500" />
						</label>
					{/if}
					{#if value.questions.length > 0}
						<label class="flex cursor-pointer items-center justify-between gap-2 rounded-2xl border border-stone-200 px-4 py-2.5 text-[14px] font-bold dark:border-white/10">
							Kvízkérdések ({value.questions.length})
							<input type="checkbox" bind:checked={doQuiz} disabled={busy} class="size-4 accent-brand-500" />
						</label>
					{/if}
					{#if value.decks.length > 0}
						<label class="flex cursor-pointer items-center justify-between gap-2 rounded-2xl border border-stone-200 px-4 py-2.5 text-[14px] font-bold dark:border-white/10">
							Kártyacsomagok ({value.decks.length} · {deckCards} kártya)
							<input type="checkbox" bind:checked={doDecks} disabled={busy} class="size-4 accent-brand-500" />
						</label>
					{/if}
				</div>
			{:else if !result.ok}
				<p role="alert" class="rounded-xl bg-red-500/10 px-3 py-2 text-[13px] font-bold text-red-700 dark:text-red-300">{result.message}</p>
			{/if}
		{/if}
		<Button onclick={runImport} busy={busy} disabled={!value || busy} block>
			{busy && progress ? progress : busy ? 'Importálás…' : 'Betöltés a leckébe'}
		</Button>
		<p class="text-[12px] leading-relaxed text-stone-500">A bekezdések a szerkesztőbe kerülnek, a Mentés gombbal véglegesítheted. A kvíz és a csomagok azonnal mentődnek.</p>
	</div>
</Drawer>

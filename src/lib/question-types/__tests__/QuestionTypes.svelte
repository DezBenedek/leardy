<script lang="ts">
	import { untrack } from 'svelte';
	import { typeComponents } from '$lib/question-types/components';
	import { prepareQuestion, questionType } from '$lib/question-types/registry';
	import type { QuestionTypeId } from '$lib/question-types/types';
	import type { QuizQuestion } from '$lib/curriculum';
	import type { QuestionDraft } from '$lib/quiz-editor';
	import QuizEditorCore from '$lib/components/quiz/QuizEditorCore.svelte';
	import type { QuizAdapter } from '$lib/components/quiz/quiz-adapter';
	import QuestionForm from '$lib/components/quiz/QuestionForm.svelte';
	import QuizRunner from '$lib/components/QuizRunner.svelte';
	import Drawer from '$lib/components/Drawer.svelte';

	let { type = 'match', mode = 'game', inDrawer = false, inputMode = 'drag', reusable = false, multiple = false }: { type?: QuestionTypeId; mode?: 'game' | 'editor' | 'runner' | 'core'; inDrawer?: boolean; inputMode?: 'drag' | 'text' | 'dropdown'; reusable?: boolean; multiple?: boolean } = $props();
	const initial = untrack((): QuizQuestion => {
		const pairs = [{ left: 'Magyarország', right: 'Budapest' }, { left: 'Franciaország', right: 'Párizs' }, { left: 'Ausztria', right: 'Bécs' }];
		const fields = { ...questionType(type).create(), options: type === 'tf' ? ['Igaz', 'Hamis'] : ['Első', 'Második', 'Harmadik'], pairs,
			correct_answer: type === 'tf' ? 'Igaz' : type === 'text' ? 'Árvíz' : 'Első' };
		if (type === 'gap') {
			fields.options = [];
			fields.settings = { mode: inputMode, reusable, text: 'Magyarország fővárosa [[Budapest]], Ausztriáé [[Bécs]].' };
		}
		if (type === 'map') {
			fields.options = [];
			fields.settings = { mode: inputMode, reusable, boxes: [
				{ id: 'elso', x: 25, y: 25, width: 30, answer: 'Budapest', arrow: { x: 40, y: 60 } },
				{ id: 'masodik', x: 75, y: 30, width: 30, answer: 'Bécs' }
			] };
		}
		if (type === 'choice' && multiple) { fields.settings = { multiple: true }; fields.correct_answer = JSON.stringify(['Első', 'Harmadik']); }
		return { id: type, type, ...(type === 'map' ? { imageUrl: 'http://localhost:5173/__question-map-image__.svg' } : {}), question_text: 'Tesztkérdés', ...fields, correct_answer: questionType(type).correctAnswer(fields) };
	});
	let q = $state(untrack(() => prepareQuestion(initial, () => 0)));
	let picked = $state<string | null>(null);
	let draft = $state<QuestionDraft>({ ...initial, quizId: 'teszt', sectionSlug: '', sort: 0 });
	const Game = $derived(typeComponents(type).Game);
	let saved = $state('');
	let changed = $state(0);
	const adapter: QuizAdapter = {
		createQuiz: async () => ({ id: 'teszt' }), renameQuiz: async () => {}, deleteQuiz: async () => {},
		duplicateQuiz: async () => ({ id: 'masolat' }), reorderQuizzes: async () => {},
		saveQuestion: async (_, value) => { saved = JSON.stringify(value); return { id: value.id || 'uj' }; },
		deleteQuestion: async () => {}, duplicateQuestion: async () => ({ id: 'masolat' }), reorderQuestions: async () => {},
		reorderLessonQuestions: async () => ({ assignments: [] }), moveQuestion: async () => {}
	};
</script>

{#snippet contents()}
	{#if mode === 'editor'}
		<QuestionForm bind:draft sections={[]} saving={false} error="" onChange={() => changed++}
			onPickType={() => {}} onPickTemplate={() => {}} onSaveTemplate={() => {}}
			onSave={() => (saved = JSON.stringify(draft))} onPreview={() => {}} />
		<output data-saved>{saved}</output><output data-changed>{changed}</output>
	{:else if mode === 'core'}
		<QuizEditorCore {adapter} sections={[]} initialQuizzes={[{ id: 'teszt', title: 'Tesztsor', section_slug: '', sort: 0, questions: [{ ...initial, quiz_id: 'teszt', sectionSlug: '', sort: 0 }] }]} />
		<output data-saved>{saved}</output>
	{:else if mode === 'runner'}
		<QuizRunner questions={[initial]} title="Tesztsor" />
	{:else}
		<div data-game>
			<Game {q} picked={picked} correct={picked !== null ? questionType(type).solution(initial) : null} onAnswer={(answer) => (picked = answer)} />
		</div>
		<div class="mt-8 flex flex-wrap gap-3">
			<button type="button" onclick={() => { q = { ...q, options: [...q.options].reverse() }; }}>Válaszok újrakeverése</button>
			<button type="button" onclick={() => { q = { ...q, leftOrder: [...(q.leftOrder ?? [])].reverse() }; }}>Bal oldal újrakeverése</button>
		</div>
		<output data-answer>{picked ?? ''}</output>
	{/if}
{/snippet}

<div class="mx-auto w-full max-w-[550px] p-4">
	{#if inDrawer}
		<Drawer open title="Feladattípus tesztje" label="Feladattípus tesztje" wide onClose={() => {}}>{@render contents()}</Drawer>
	{:else}
		{@render contents()}
	{/if}
</div>

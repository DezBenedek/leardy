<script lang="ts">
	import { untrack } from 'svelte';
	import { typeComponents } from '$lib/question-types/components';
	import { prepareQuestion, questionType } from '$lib/question-types/registry';
	import type { QuestionTypeId } from '$lib/question-types/types';
	import type { QuizQuestion } from '$lib/curriculum';
	import type { QuestionDraft } from '$lib/quiz-editor';
	import QuestionForm from '$lib/components/quiz/QuestionForm.svelte';
	import QuizRunner from '$lib/components/QuizRunner.svelte';
	import Drawer from '$lib/components/Drawer.svelte';

	let { type = 'match', mode = 'game', inDrawer = false }: { type?: QuestionTypeId; mode?: 'game' | 'editor' | 'runner'; inDrawer?: boolean } = $props();
	const initial = untrack((): QuizQuestion => {
		const pairs = [{ left: 'Magyarország', right: 'Budapest' }, { left: 'Franciaország', right: 'Párizs' }, { left: 'Ausztria', right: 'Bécs' }];
		const fields = { ...questionType(type).create(), options: type === 'tf' ? ['Igaz', 'Hamis'] : ['Első', 'Második', 'Harmadik'], pairs,
			correct_answer: type === 'tf' ? 'Igaz' : type === 'text' ? 'Árvíz' : 'Első' };
		return { id: type, type, question_text: 'Tesztkérdés', ...fields, correct_answer: questionType(type).correctAnswer(fields) };
	});
	let q = $state(untrack(() => prepareQuestion(initial, () => 0)));
	let picked = $state<string | null>(null);
	let draft = $state<QuestionDraft>({ ...initial, quizId: 'teszt', sectionSlug: '', sort: 0 });
	const Game = $derived(typeComponents(type).Game);
	let saved = $state('');
	let changed = $state(0);
</script>

{#snippet contents()}
	{#if mode === 'editor'}
		<QuestionForm bind:draft sections={[]} saving={false} error="" onChange={() => changed++}
			onPickType={() => {}} onPickTemplate={() => {}} onSaveTemplate={() => {}}
			onSave={() => (saved = JSON.stringify(draft))} onPreview={() => {}} />
		<output data-saved>{saved}</output><output data-changed>{changed}</output>
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

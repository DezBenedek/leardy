<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ArrowLeft } from '@lucide/svelte';
	import { createBackNavigation } from '$lib/back-navigation';
	import { type EditorLesson, type EditorQuiz } from '$lib/curriculum-editor';
	import { lessonSections } from '$lib/lesson-content';
	import IconButton from '$lib/ui/IconButton.svelte';
	import QuizEditorCore from './QuizEditorCore.svelte';
	import { createLessonQuizAdapter } from './quiz-adapter';

	let { lesson, quizzes }: { lesson: EditorLesson; quizzes: EditorQuiz[] } = $props();
	let hasUnsavedChanges = $state(false);
	let busy = $state(false);
	const adapter = $derived(createLessonQuizAdapter(lesson.levelId, lesson.id));
	const sections = $derived(lessonSections(lesson)
		.filter((section) => !section.intro && section.title.trim())
		.map((section) => ({ slug: section.slug!, title: section.title.trim() })));
	const goBack = createBackNavigation(() => resolve('/tanulas/szerkeszto/lecke/[id]', { id: lesson.id }));

	beforeNavigate((navigation) => {
		if (busy) { navigation.cancel(); return; }
		if (!hasUnsavedChanges) return;
		if (navigation.willUnload || !confirm('Nem mentett módosítások vannak a kvízben. Elhagyod az oldalt?')) navigation.cancel();
	});
	function beforeUnload(event: BeforeUnloadEvent) {
		if (!hasUnsavedChanges && !busy) return;
		event.preventDefault();
		event.returnValue = '';
	}
</script>

<svelte:head><title>Kvíz: {lesson.title} | Leardy</title></svelte:head>
<svelte:window onbeforeunload={beforeUnload} />

<QuizEditorCore {adapter} {sections} initialQuizzes={quizzes}
	onDirtyChange={(value) => (hasUnsavedChanges = value)} onBusyChange={(value) => (busy = value)}>
	{#snippet header(actions)}
		<header class="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
			<IconButton ariaLabel="Vissza a lecke szerkesztéséhez" size={44} onclick={goBack}><ArrowLeft size={21} aria-hidden="true" /></IconButton>
			<div class="min-w-10 flex-1">
				<h1 class="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">Kvíz</h1>
				<p class="max-w-[45vw] truncate text-xs text-stone-500 sm:max-w-none dark:text-stone-400">{lesson.title}</p>
			</div>
			{@render actions()}
		</header>
	{/snippet}
</QuizEditorCore>

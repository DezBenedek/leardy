<script lang="ts">
	import LessonQuizEditor from '$lib/components/quiz/LessonQuizEditor.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

{#key data.lesson.id}
	<LessonQuizEditor lesson={data.lesson} quizzes={data.quizzes} />
{/key}

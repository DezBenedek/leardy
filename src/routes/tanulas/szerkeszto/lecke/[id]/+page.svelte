<script lang="ts">
	import LessonEditor from '$lib/components/LessonEditor.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

{#key data.lesson.id}
	<LessonEditor lesson={data.lesson} initialQuizzes={data.quizzes} />
{/key}

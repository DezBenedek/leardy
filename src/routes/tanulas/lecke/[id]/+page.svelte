<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import type { LessonDocument } from '$lib/content-protocol';
	import { Query } from '$lib/query.svelte';
	import { contentFetch } from '$lib/content-client';
	import LessonReader from '$lib/components/LessonReader.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	let { data }: { data: PageData } = $props();
	const lessonQ = new Query<LessonDocument>();
	let busy = $state(false);
	let displayed = $state<LessonDocument>(untrack(() => data));
	$effect(() => {
		const id = data.lessonPage.lesson.id;
		lessonQ.load(`lesson:${id}`, async (cached) => {
			const response = await contentFetch(`/api/lessons/${encodeURIComponent(id)}`, cached);
			if (!response.ok) throw new Error(`http ${response.status}`);
			return response.json();
		});
	});
	$effect(() => { if (!busy) displayed = lessonQ.data ?? data; });
</script>

{#if lessonQ.error && !busy}
	<EmptyState title="A lecke nem elérhető" description="Lehet, hogy közben törölték vagy visszavonták a közzétételét." />
{:else}
	{#if lessonQ.offline}<p role="status" class="mb-3 text-sm text-stone-500">Offline vagy. A mentett tananyagot látod.</p>{/if}
	<LessonReader lessonPage={displayed.lessonPage} quizVersion={displayed.quizVersion} onBusyChange={(value) => busy = value} />
{/if}

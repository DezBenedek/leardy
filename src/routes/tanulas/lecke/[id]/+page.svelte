<script lang="ts">
	import type { PageData } from './$types';
	import type { LessonDocument } from '$lib/content-protocol';
	import { Query } from '$lib/query.svelte';
	import { contentFetch, subscribeContent } from '$lib/content-client';
	import LessonReader from '$lib/components/LessonReader.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import { ArrowLeft } from '@lucide/svelte';
	import { createBackNavigation } from '$lib/back-navigation';
	import { resolve } from '$app/paths';
	let { data }: { data: PageData } = $props();
	const lessonQ = new Query<LessonDocument>();
	let busy = $state(false);
	let displayed = $state<LessonDocument>();
	let connected = $state(true);
	let loadStatus = $state<number | null>(null);
	let notFound = $derived(loadStatus === 404 || loadStatus === 410);
	const goBack = createBackNavigation(() => resolve('/tanulas'));
	$effect(() => {
		const id = data.lessonId;
		loadStatus = null;
		lessonQ.load(`lesson:${id}`, async (cached) => {
			let response: Response;
			try {
				response = await contentFetch(`/api/lessons/${encodeURIComponent(id)}`, cached);
			} catch {
				loadStatus = 0;
				throw new Error('http offline');
			}
			if (!response.ok) {
				loadStatus = response.status;
				throw new Error(`http ${response.status}`);
			}
			loadStatus = null;
			connected = response.headers.get('x-content-offline') !== 'true';
			return response.json();
		});
	});
	$effect(() => { if (!busy) displayed = lessonQ.data; });
	$effect(() => {
		const id = data.lessonId;
		return subscribeContent((message) => {
			if (message.type !== 'content-deleted' || !message.url) return;
			try {
				const tail = decodeURIComponent(new URL(message.url).pathname.split('/').pop() ?? '');
				if (tail === id) loadStatus = 404;
			} catch {
				loadStatus = 404;
			}
		});
	});
</script>

<svelte:window onoffline={() => connected = false} ononline={() => connected = true} />

{#if lessonQ.error && !busy}
	<div class="mb-3 flex items-center gap-2"><IconButton ariaLabel="Vissza a tananyagokhoz" size={44} onclick={goBack}><ArrowLeft size={21} /></IconButton><h1 class="font-display text-2xl font-extrabold">Lecke</h1></div>
	{#if notFound}
		<EmptyState title="Nincs ilyen lecke" description="Ezt a leckét törölték, vagy soha nem létezett. Ellenőrizd a hivatkozást." />
	{:else}
		<EmptyState title="A lecke nem elérhető" description="Internet nélkül csak a korábban megnyitott, ezen az eszközön tárolt leckék érhetők el." />
	{/if}
{:else if displayed}
	{#if lessonQ.offline || !connected}<p role="status" class="mb-3 text-sm text-stone-500">Offline vagy. A mentett tananyagot látod.</p>{/if}
	<LessonReader lessonPage={displayed.lessonPage} quizVersion={displayed.quizVersion} offline={lessonQ.offline || !connected} onBusyChange={(value) => busy = value} />
{:else}
	<div role="status" aria-label="Lecke betöltése" class="space-y-4"><Skeleton cls="h-8 w-2/3 rounded-lg" /><Skeleton cls="h-40 w-full rounded-2xl" /></div>
{/if}

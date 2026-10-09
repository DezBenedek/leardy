<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { ArrowLeft, ChevronRight } from '@lucide/svelte';
	import { CONTENT_CACHE, type LessonDocument } from '$lib/content-protocol';
	import { contentFetch, offlineIdentity, subscribeContent } from '$lib/content-client';
	import { dismissProgress, outbox } from '$lib/progress-outbox.svelte';
	import LessonReader from '$lib/components/LessonReader.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	let lessons = $state<LessonDocument[]>([]);
	let loading = $state(true);
	let busy = $state(false);
	let displayed = $state<LessonDocument | undefined>();
	let connected = $state(false);
	let mounted = $state(false);
	let identified = $state(false);
	let id = $derived(mounted ? page.url.searchParams.get('lesson') ?? '' : '');
	let current = $derived(lessons.find((l) => l.lessonPage.lesson.id === id));
	$effect(() => { if (!busy) displayed = current; });
	$effect(() => {
		const selected = id;
		if (selected) untrack(() => {
			if (navigator.onLine) void contentFetch(`/api/lessons/${encodeURIComponent(selected)}`).catch(() => undefined);
		});
	});
	async function readLessons() {
		try {
			const cache = await caches.open(CONTENT_CACHE);
			const documents: LessonDocument[] = [];
			for (const key of await cache.keys()) {
				if (!/^\/api\/lessons\/[^/]+$/.test(new URL(key.url).pathname)) continue;
				const response = await cache.match(key, { ignoreVary: true });
				if (response) documents.push(await response.json());
			}
			lessons = documents.sort((a, b) => a.lessonPage.lesson.title.localeCompare(b.lessonPage.lesson.title, 'hu'));
		} finally { loading = false; }
	}
	async function verify() {
		if (!navigator.onLine) { connected = false; return; }
		const subjects = new Set(lessons.map((l) => l.lessonPage.subject.id));
		await Promise.allSettled([...subjects].map((subject) => contentFetch(`/api/browse?subject=${encodeURIComponent(subject)}`)));
		const selected = id;
		if (selected) await contentFetch(`/api/lessons/${encodeURIComponent(selected)}`).catch(() => undefined);
	}
	onMount(() => {
		mounted = true;
		identified = !!offlineIdentity();
		void readLessons().then(verify).catch(() => { loading = false; });
		return subscribeContent((message) => {
			if (message.type === 'content-status') connected = !message.offline;
			else if (message.type === 'content-invalidated') void verify();
			else void readLessons();
		});
	});
	const back = () => { void goto(resolve('/offline')); };
</script>

<svelte:head><title>Mentett leckék | Leardy</title></svelte:head>
<p role="status" class="mb-4 rounded-xl bg-stone-100 p-3 text-sm text-stone-600 dark:bg-white/5 dark:text-stone-300">
	{connected ? 'A kapcsolat helyreállt. A mentett tananyagot ellenőrizzük.' : 'Offline olvasó: a korábban megnyitott tananyagok elérhetők.'}
	{#if outbox.pending > 0} {outbox.pending} eredmény mentésre vár.{/if}
	{#if !identified} Az eredmények fiókba mentéséhez előbb jelentkezz be online.{/if}
</p>
{#each outbox.rejected as result (result.eventId)}
	<div role="status" class="mb-3 rounded-xl border border-amber-300 p-3 text-sm">
		A korábbi eredményed: {result.score}/{result.total}. {result.status === 'deleted' ? 'A leckét törölték.' : 'A kérdéssor megváltozott, új kitöltés szükséges.'}
		<button class="ml-2 font-bold underline" onclick={() => void dismissProgress(result.eventId)}>Rendben</button>
	</div>
{/each}
{#if displayed}
	{#key displayed.lessonPage.lesson.id}<LessonReader lessonPage={displayed.lessonPage} quizVersion={displayed.quizVersion} offline onBack={back} onBusyChange={(value) => busy = value} />{/key}
{:else}
	<div class="flex items-center gap-2">
		<IconButton ariaLabel="Vissza a tananyagokhoz" size={44} onclick={() => { if (connected) void goto(resolve('/tanulas')); else back(); }}><ArrowLeft size={21} /></IconButton>
		<h1 class="font-display text-2xl font-extrabold">Mentett leckék</h1>
	</div>
	{#if id && !loading}<p class="mt-3 text-sm text-stone-500">Ez a lecke nincs elmentve, vagy már nem érhető el.</p>{/if}
	{#if loading}<p role="status" class="mt-4">Mentett tananyag betöltése…</p>
	{:else if lessons.length === 0}<p class="mt-4 text-stone-500">Még nincs mentett lecke. Nyiss meg egy leckét internetkapcsolattal!</p>
	{:else}
		<div class="mt-4 grid gap-2">
			{#each lessons as lesson (lesson.lessonPage.lesson.id)}
				<a href={resolve('/offline') + '?lesson=' + encodeURIComponent(lesson.lessonPage.lesson.id)} class="flex items-center gap-3 rounded-2xl border border-stone-200 p-4 dark:border-white/10">
					<div class="min-w-0 flex-1"><strong>{lesson.lessonPage.lesson.title}</strong><p class="text-sm text-stone-500">{lesson.lessonPage.subject.title} · {lesson.lessonPage.level.title}</p></div><ChevronRight size={18} />
				</a>
			{/each}
		</div>
	{/if}
{/if}

<script lang="ts">
	import { onMount } from 'svelte';
	import QuizPlayer from '$lib/components/QuizPlayer.svelte';
	import { studyApi, type QuizQ } from '$lib/study';

	let { params } = $props();

	let title = $state('');
	let quiz = $state<QuizQ[]>([]);
	let loading = $state(true);
	let err = $state<string | null>(null);
	let finished = $state(false);
	let score = $state(0);

	onMount(async () => {
		try {
			const data = await studyApi.exam(params.id);
			title = data.topic.title;
			quiz = data.quiz;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Témazáró — Leardy</title>
</svelte:head>

<nav class="mt-3 text-[13px] text-stone-500 dark:text-stone-400" aria-label="Morzsa">
	<a href="/temakorok" class="hover:underline">Témakörök</a>
	<span> · </span>
	<a href="/temakorok/{params.id}" class="hover:underline">{title || 'Témakör'}</a>
</nav>
<h1 class="mt-1 text-[24px] font-extrabold tracking-tight text-ink-900 dark:text-white">Témazáró gyakorlás</h1>
<p class="text-sm text-ink-600 dark:text-stone-400">Az összes lecke kérdése keverve — ez gyakorlás, nem éles dolgozat.</p>

{#if loading}
	<p class="mt-4 text-sm text-stone-500 dark:text-stone-400">Kérdések összeállítása…</p>
{:else if err}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else}
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<QuizPlayer
			questions={quiz}
			onFinish={(s) => {
				score = s;
				finished = true;
			}}
		/>
		{#if finished}
			<p class="mt-3 text-center text-sm font-bold text-ink-900 dark:text-white">
				Eredmény: {score} / {quiz.length} — a leckéknél tudod célzottan pótolni a hiányt.
			</p>
		{/if}
	</section>
{/if}

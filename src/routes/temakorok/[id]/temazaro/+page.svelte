<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Play } from '@lucide/svelte';
	import { player } from '$lib/player.svelte';
	import { studyApi, type QuizQ } from '$lib/study';

	let { params } = $props();

	let title = $state('');
	let quiz = $state<QuizQ[]>([]);
	let loading = $state(true);
	let err = $state<string | null>(null);
	let lastScore = $state<number | null>(null);
	let lastTotal = $state(0);
	let opened = $state(false);

	async function open() {
		if (quiz.length === 0) return;
		opened = true;
		player.openQuiz({
			title: 'Témazáró gyakorlás',
			subtitle: title,
			questions: quiz,
			reveal: true,
			onFinish: async (score, total) => {
				lastScore = score;
				lastTotal = total;
			}
		});
	}

	onMount(async () => {
		try {
			const data = await studyApi.exam(params.id);
			title = data.topic.title;
			quiz = data.quiz;
			// Azonnal indul a teljes képernyős lejátszó; kilépés után innen újraindítható.
			await open();
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
	<a href="/temakorok/{params.id}" class="hover:underline">← {title || 'Témakör'}</a>
</nav>
<h1 class="mt-1 text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Témazáró gyakorlás</h1>
<p class="text-sm text-ink-600 dark:text-stone-400">Az összes lecke kérdése keverve — ez gyakorlás, nem éles dolgozat.</p>

{#if loading}
	<p class="animate-pulse mt-4 text-sm text-stone-500 dark:text-stone-400">Kérdések összeállítása…</p>
{:else if err && quiz.length === 0}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else}
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-6 text-center dark:border-white/10 dark:bg-stone-900">
		<p class="font-display text-[40px] leading-none font-extrabold text-ink-900 dark:text-white">{quiz.length}</p>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">kérdés vár</p>
		{#if lastScore !== null}
			<p class="mt-2 text-sm font-bold text-emerald-600 dark:text-emerald-300">Utóbbi eredmény: {lastScore} / {lastTotal}</p>
		{/if}
		<button
			onclick={() => void open()}
			class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink-900 py-3 text-[15px] font-bold text-white transition hover:opacity-90 active:scale-[0.99] dark:bg-white dark:text-ink-900"
		>
			<Play size={18} fill="currentColor" /> {opened ? 'Újraindítás' : 'Indítás'}
		</button>
		<button onclick={() => goto(`/temakorok/${params.id}`)} class="mt-2 w-full rounded-full py-2.5 text-sm font-semibold text-stone-500 dark:text-stone-400">
			Vissza a témakörhöz
		</button>
	</section>
{/if}

<script lang="ts">
	import { onMount } from 'svelte';
	import { CheckCircle2, Circle, FileText } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import { get as cacheGet, invalidate, peek } from '$lib/cache';
	import { studyApi, type LessonRow, type Topic } from '$lib/study';

	let { params } = $props();
	let topic = $state<Topic | null>(null);
	let lessons = $state<LessonRow[]>([]);
	let enrolled = $state(false);
	let err = $state<string | null>(null);

	let key = $derived(`topic:${params.id}`);

	async function load() {
		err = null;
		try {
			const res = await cacheGet(
				key,
				() => studyApi.topic(params.id),
				60000
			);
			topic = res.data.topic;
			lessons = res.data.lessons;
			enrolled = res.data.enrolled;
		} catch (e) {
			if (!topic) err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	onMount(() => {
		const cached = peek<{ topic: Topic; lessons: LessonRow[]; enrolled: boolean }>(key);
		if (cached) {
			topic = cached.topic;
			lessons = cached.lessons;
			enrolled = cached.enrolled;
		}
		void load();
	});

	async function enroll() {
		if (!auth.user) {
			authUI.show('login');
			return;
		}
		try {
			await studyApi.enroll(params.id);
			enrolled = true;
			invalidate('topics');
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	function isDone(l: LessonRow): boolean {
		return (l.theory_done ?? 0) === 1 && ((l.cards_done ?? 0) === 1 || (l.quiz_done ?? 0) === 1);
	}
</script>

<svelte:head>
	<title>{topic ? `${topic.title} — Leardy` : 'Témakör — Leardy'}</title>
</svelte:head>

<nav class="mt-3 text-[13px] text-stone-500 dark:text-stone-400" aria-label="Morzsa">
	<a href="/temakorok" class="hover:underline">← Témakörök</a>
</nav>

{#if err && !topic}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else if topic}
	<div class="mt-1 flex flex-wrap items-center gap-2">
		<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">{topic.title}</h1>
		<span class="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-500 dark:bg-white/10 dark:text-stone-300">
			{topic.category}{topic.type === 'language' ? ' · audió + kiejtés' : ''}
		</span>
	</div>
	<p class="mt-0.5 text-sm text-ink-600 dark:text-stone-400">{lessons.length} lecke · elmélet, kártyák és kvíz leckénként</p>
	{#if !enrolled}
		<button
			onclick={enroll}
			class="mt-3 w-full rounded-full bg-brand-500 px-4 py-2.5 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99]"
		>
			+ Felveszem a saját profilomba
		</button>
	{/if}

	<div class="mt-3 space-y-2.5">
		{#each lessons as l, i (l.id)}
			<a
				href="/lecke/{l.id}"
				class="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 transition hover:bg-stone-50 active:scale-[0.995] dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
			>
				{#if isDone(l)}
					<CheckCircle2 size={22} class="shrink-0 text-emerald-500" />
				{:else}
					<Circle size={22} class="shrink-0 text-brand-500" />
				{/if}
				<div class="min-w-0 flex-1">
					<p class="truncate text-[15px] font-semibold text-ink-900 dark:text-white">{i + 1}. {l.title}</p>
					<p class="text-[13px] text-ink-400 dark:text-stone-500">
						Elmélet · Kártyák · Kvíz{#if (l.quiz_best ?? 0) > 0} · legjobb: {l.quiz_best}%{/if}
					</p>
				</div>
				<span class="shrink-0 rounded-full bg-brand-500 px-3.5 py-1.5 text-[13px] font-semibold text-white">
					{isDone(l) ? 'Átnézés' : 'Start'}
				</span>
			</a>
		{/each}
	</div>

	<a
		href="/temakorok/{topic.id}/temazaro"
		class="mt-3 flex items-center gap-3.5 rounded-2xl bg-ink-900 p-4 transition hover:opacity-90 active:scale-[0.995] dark:bg-white"
	>
		<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15 text-white dark:bg-ink-900/10 dark:text-ink-900">
			<FileText size={20} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-white dark:text-ink-900">Összevont témazáró</span>
			<span class="block text-[13px] text-white/70 dark:text-ink-900/60">Az összes lecke kérdése keverve</span>
		</span>
	</a>
{/if}

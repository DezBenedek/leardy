<script lang="ts">
	import { onMount } from 'svelte';
	import { BookOpenText, CheckCircle2, Circle, FileText, Layers, Lock } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import { studyApi, type LessonRow, type Topic } from '$lib/study';

	let { params } = $props();
	let topic = $state<Topic | null>(null);
	let lessons = $state<LessonRow[]>([]);
	let enrolled = $state(false);
	let loading = $state(true);
	let err = $state<string | null>(null);

	async function load() {
		loading = true;
		err = null;
		try {
			const data = await studyApi.topic(params.id);
			topic = data.topic;
			lessons = data.lessons;
			enrolled = data.enrolled;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loading = false;
		}
	}

	onMount(load);

	async function enroll() {
		if (!auth.user) {
			authUI.show('login');
			return;
		}
		try {
			await studyApi.enroll(params.id);
			enrolled = true;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	function lessonState(l: LessonRow): 'done' | 'open' {
		if (l.theory_done && (l.cards_done || l.quiz_done)) return 'done';
		return 'open';
	}
</script>

<svelte:head>
	<title>{topic ? `${topic.title} — Leardy` : 'Témakör — Leardy'}</title>
</svelte:head>

{#if loading}
	<p class="mt-4 text-sm text-stone-500 dark:text-stone-400">Betöltés…</p>
{:else if err || !topic}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
		{err ?? 'Nincs ilyen témakör.'}
	</p>
	<a href="/temakorok" class="mt-3 inline-block text-sm font-semibold text-brand-600 dark:text-brand-400">← Vissza a könyvtárba</a>
{:else}
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<div class="flex items-center gap-3.5">
			<span class="grid size-11 shrink-0 place-items-center rounded-xl {topic.type === 'language' ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white' : 'bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300'}">
				{#if topic.type === 'language'}
					<BookOpenText size={22} />
				{:else}
					<Layers size={22} />
				{/if}
			</span>
			<div class="min-w-0 flex-1">
				<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">{topic.title}</h1>
				<p class="text-sm text-ink-600 dark:text-stone-400">
					{topic.category} · {topic.type === 'language' ? 'Nyelvi (audió + kiejtés)' : 'Tantárgyi (vizuális feladatok)'} · {lessons.length} lecke
				</p>
			</div>
		</div>
		{#if !enrolled}
			<button
				onclick={enroll}
				class="mt-4 w-full rounded-full bg-brand-500 px-4 py-2.5 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99]"
			>
				+ Felveszem a saját profilomba
			</button>
		{/if}
	</section>

	<div class="mt-3 space-y-3">
		{#each lessons as l, i (l.id)}
			{@const st = lessonState(l)}
			<a
				href="/lecke/{l.id}"
				class="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-5 transition hover:bg-stone-50 dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
			>
				{#if st === 'done'}
					<CheckCircle2 size={22} class="shrink-0 text-emerald-500" />
				{:else}
					<Circle size={22} class="shrink-0 text-brand-500" />
				{/if}
				<div class="min-w-0 flex-1">
					<p class="truncate text-[15px] font-semibold text-ink-900 dark:text-white">
						{i + 1}. {l.title}
					</p>
					<p class="text-[13px] text-ink-400 dark:text-stone-500">
						Elmélet · Kártyák · Kvíz{#if (l.quiz_best ?? 0) > 0} · legjobb: {l.quiz_best}%{/if}
					</p>
				</div>
				<span class="shrink-0 rounded-full bg-brand-500 px-3.5 py-1.5 text-[13px] font-semibold text-white">
					{st === 'done' ? 'Átnézés' : 'Start'}
				</span>
			</a>
		{/each}
	</div>

	<!-- Összevont témazáró modul a témakör alján -->
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<div class="flex items-center gap-3.5">
			<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-ink-900 text-white dark:bg-white dark:text-ink-900">
				<FileText size={22} />
			</span>
			<div>
				<h2 class="text-[16px] font-bold text-ink-900 dark:text-white">Összevont témazáró</h2>
				<p class="text-sm text-ink-600 dark:text-stone-400">Az összes lecke kvíze keverve, gyakorlásnak.</p>
			</div>
		</div>
		<a
			href="/temakorok/{topic.id}/temazaro"
			class="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-ink-900 px-4 py-2.5 text-[15px] font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-ink-900"
		>
			<Lock size={16} /> Témazáró indítása
		</a>
	</section>
{/if}

<script lang="ts">
	import { onMount } from 'svelte';
	import { BookOpenText, CheckCircle2, Layers, ListChecks, Play } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { get as cacheGet, invalidate, peek } from '$lib/cache';
	import { player } from '$lib/player.svelte';
	import { renderMarkdown, studyApi, type LessonDetail } from '$lib/study';

	let { params } = $props();

	type Tab = 'theory' | 'cards' | 'quiz';
	let tab = $state<Tab>('theory');
	let data = $state<LessonDetail | null>(null);
	let err = $state<string | null>(null);
	let saving = $state(false);

	let isLang = $derived(data?.topic.type === 'language');

	async function load() {
		err = null;
		try {
			const res = await cacheGet(`lesson:${params.id}`, () => studyApi.lesson(params.id), 120000);
			data = res.data;
		} catch (e) {
			if (!data) err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	onMount(() => {
		data = peek<LessonDetail>(`lesson:${params.id}`) ?? null;
		void load();
	});

	async function complete(kind: 'theory' | 'cards' | 'quiz', score?: number) {
		if (!auth.user || !data) return;
		saving = true;
		try {
			await studyApi.completeLesson(data.lesson.id, { kind, score });
			invalidate('stats');
			invalidate(`topic:${data.topic.id}`);
			await auth.refresh();
			if (data) {
				if (kind === 'theory') data.progress.theory_done = 1;
				if (kind === 'cards') data.progress.cards_done = 1;
				if (kind === 'quiz') {
					data.progress.quiz_done = 1;
					if (score !== undefined) data.progress.quiz_best = Math.max(data.progress.quiz_best, score);
				}
			}
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			saving = false;
		}
	}

	function startCards() {
		if (!data) return;
		player.openCards({
			title: data.lesson.title,
			subtitle: `${data.topic.title} · Kártyák`,
			cards: data.cards,
			isLanguage: isLang,
			repeatUnknown: true,
			untilAllKnown: false,
			onGrade: async (card, known) => {
				if (!auth.user) return;
				try {
					await studyApi.grade(card.id, known, false);
					invalidate('stats');
				} catch {
					// a menet helyben folytatódik
				}
			},
			onFinish: async () => {
				await complete('cards');
				tab = 'quiz';
			}
		});
	}

	function startQuiz() {
		if (!data) return;
		player.openQuiz({
			title: data.lesson.title,
			subtitle: `${data.topic.title} · Kvíz`,
			questions: data.quiz,
			reveal: true,
			onFinish: async (score, total) => {
				const pct = total > 0 ? Math.round((score / total) * 100) : 0;
				await complete('quiz', pct);
			}
		});
	}

	const tabs: { id: Tab; label: string; icon: typeof BookOpenText; done: boolean }[] = $derived(
		data
			? [
					{ id: 'theory', label: 'Elmélet', icon: BookOpenText, done: data.progress.theory_done === 1 },
					{ id: 'cards', label: 'Kártyák', icon: Layers, done: data.progress.cards_done === 1 },
					{ id: 'quiz', label: 'Kvíz', icon: ListChecks, done: data.progress.quiz_done === 1 }
				]
			: []
	);
</script>

<svelte:head>
	<title>{data ? `${data.lesson.title} — Leardy` : 'Lecke — Leardy'}</title>
</svelte:head>

{#if !data && !err}
	<p class="animate-pulse mt-4 text-sm text-stone-500 dark:text-stone-400">Lecke betöltése…</p>
{:else if err && !data}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else if data}
	<nav class="mt-3 text-[13px] text-stone-500 dark:text-stone-400" aria-label="Morzsa">
		<a href="/temakorok" class="hover:underline">Témakörök</a>
		<span> · </span>
		<a href="/temakorok/{data.topic.id}" class="hover:underline">{data.topic.title}</a>
	</nav>
	<h1 class="mt-1 text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">{data.lesson.title}</h1>
	<p class="text-sm text-ink-600 dark:text-stone-400">
		{data.topic.category} · {data.cards.length} kártya · {data.quiz.length} kérdés
	</p>

	<div class="mt-3 grid grid-cols-3 gap-2" role="tablist" aria-label="Lecke modulok">
		{#each tabs as t (t.id)}
			{@const Icon = t.icon}
			<button
				role="tab"
				aria-selected={tab === t.id}
				onclick={() => (tab = t.id)}
				class={[
					'flex items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-semibold transition',
					tab === t.id
						? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900'
						: 'bg-stone-100 text-ink-600 hover:bg-stone-200 dark:bg-white/10 dark:text-stone-300'
				]}
			>
				<Icon size={16} />
				{t.label}
				{#if t.done}<CheckCircle2 size={15} class="text-emerald-500" />{/if}
			</button>
		{/each}
	</div>

	{#if err}
		<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
	{/if}

	{#if tab === 'theory'}
		<article class="prose-leardy mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
			{@html renderMarkdown(data.lesson.description_markdown)}
		</article>
		{#if data.progress.theory_done === 1}
			<p class="mt-3 flex items-center gap-2 text-[15px] font-bold text-emerald-600 dark:text-emerald-400">
				<CheckCircle2 size={17} /> Elmélet kész (+5 XP jóváírva)
			</p>
		{:else}
			<button
				onclick={() => complete('theory')}
				disabled={saving || !auth.user}
				title={!auth.user ? 'Jelentkezz be a haladás mentéséhez' : ''}
				class="mt-3 w-full rounded-full bg-brand-500 px-4 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99] disabled:opacity-60"
			>
				{saving ? 'Mentés…' : 'Elmélet kész'}
			</button>
			{#if !auth.user}
				<p class="mt-2 text-center text-[13px] text-stone-500 dark:text-stone-400">Olvasni bejelentkezés nélkül is tudsz; a mentéshez lépj be.</p>
			{/if}
		{/if}
	{:else if tab === 'cards'}
		<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 text-center sm:p-6 dark:border-white/10 dark:bg-stone-900">
			<span class="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
				<Layers size={26} />
			</span>
			<h2 class="font-display mt-3 text-[20px] font-bold text-ink-900 dark:text-white">Kártyák</h2>
			<p class="mx-auto mt-1 max-w-xs text-sm text-stone-500 tabular-nums dark:text-stone-400">
				{data.cards.length} kártya
			</p>
			{#if data.progress.cards_done === 1}
				<p class="mt-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">✓ Már végigmentél ezen a paklin</p>
			{/if}
			<button
				onclick={startCards}
				class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 py-3 text-[15px] font-bold text-white transition hover:bg-emerald-600 active:scale-[0.99]"
			>
				<Play size={18} fill="currentColor" /> Indítás
			</button>
		</section>
	{:else}
		<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 text-center sm:p-6 dark:border-white/10 dark:bg-stone-900">
			<span class="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white">
				<ListChecks size={26} />
			</span>
			<h2 class="font-display mt-3 text-[20px] font-bold text-ink-900 dark:text-white">Kvíz</h2>
			<p class="mx-auto mt-1 max-w-xs text-sm text-stone-500 tabular-nums dark:text-stone-400">
				{data.quiz.length} feladat
			</p>
			{#if data.progress.quiz_best > 0}
				<p class="mt-2 text-sm font-bold text-emerald-600 dark:text-emerald-300">Legjobb eredmény: {data.progress.quiz_best}%</p>
			{/if}
			<button
				onclick={startQuiz}
				class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99]"
			>
				<Play size={18} fill="currentColor" /> Indítás
			</button>
		</section>
	{/if}
{/if}

<style>
	.prose-leardy :global(h3) {
		font-size: 1.1rem;
		font-weight: 800;
		letter-spacing: -0.01em;
	}
	.prose-leardy :global(p),
	.prose-leardy :global(li) {
		font-size: 0.95rem;
		line-height: 1.65;
		margin-top: 0.5rem;
	}
	.prose-leardy :global(ul) {
		list-style: disc;
		padding-left: 1.25rem;
	}
	.prose-leardy :global(blockquote) {
		border-left: 3px solid var(--color-brand-500, #4255ff);
		padding-left: 0.75rem;
		font-style: italic;
		opacity: 0.9;
	}
	.prose-leardy :global(strong) {
		font-weight: 700;
	}
</style>

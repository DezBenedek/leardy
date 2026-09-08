<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowLeft, BookOpenText, CheckCircle2, Layers, ListChecks } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { get as cacheGet, invalidate, peek } from '$lib/cache';
	import { player } from '$lib/player.svelte';
	import { QueuedOffline, renderMarkdown, studyApi, type LessonDetail } from '$lib/study';

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

	async function complete(kind: 'theory' | 'cards' | 'quiz', score?: number, done = true) {
		if (!auth.user || !data) return;
		saving = true;
		try {
			await studyApi.completeLesson(data.lesson.id, { kind, score, done });
			invalidate('stats');
			invalidate(`topic:${data.topic.id}`);
			await auth.refresh();
			if (data) {
				if (kind === 'theory') data.progress.theory_done = done ? 1 : 0;
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

	function pressTab(id: Tab) {
		if (id === 'theory') tab = 'theory';
		else if (id === 'cards') startCards();
		else startQuiz();
	}
</script>

<svelte:head>
	<title>{data ? `${data.lesson.title} — Leardy` : 'Lecke — Leardy'}</title>
</svelte:head>

{#if !data && !err}
	<p class="animate-pulse mt-4 text-sm text-stone-500 dark:text-stone-400">Lecke betöltése…</p>
{:else if err && !data}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else if data}
	<div class="mt-3 flex items-center gap-2">
		<a
			href="/temakorok/{data.topic.id}"
			aria-label="Vissza a témakörhöz"
			class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-900 transition hover:bg-stone-50 active:scale-95 dark:border-white/10 dark:bg-stone-900 dark:text-white"
		>
			<ArrowLeft size={20} />
		</a>
		<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">{data.lesson.title}</h1>
	</div>
	<p class="mt-1 text-sm text-ink-600 dark:text-stone-400">
		{data.topic.category} · {data.cards.length} kártya · {data.quiz.length} feladat
	</p>

	<div class="mt-3 grid grid-cols-3 gap-2" role="tablist" aria-label="Lecke modulok">
		{#each tabs as t (t.id)}
			{@const Icon = t.icon}
			<button
				role="tab"
				aria-selected={tab === t.id}
				onclick={() => pressTab(t.id)}
				class={[
					'flex items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-semibold transition active:scale-[0.98]',
					t.id === 'theory' && tab === 'theory'
						? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900'
						: 'bg-brand-500 text-white hover:bg-brand-600'
				]}
			>
				<Icon size={16} />
				{t.label}
				{#if t.done}<CheckCircle2 size={15} />{/if}
			</button>
		{/each}
	</div>

	{#if err}
		<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
	{/if}

	<article class="prose-leardy mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		{@html renderMarkdown(data.lesson.description_markdown)}
	</article>
		{#if !auth.user}
			<p class="mt-2 text-center text-[13px] text-stone-500 dark:text-stone-400">Olvasni bejelentkezés nélkül is tudsz; a mentéshez lépj be.</p>
		{:else}
			<button
				onclick={() => complete('theory', undefined, (data?.progress.theory_done ?? 0) !== 1)}
				disabled={saving}
				aria-pressed={data.progress.theory_done === 1}
				class={[
					'mt-3 flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-[15px] font-bold transition active:scale-[0.99] disabled:opacity-60',
					data.progress.theory_done === 1
						? 'bg-emerald-500 text-white hover:bg-emerald-600'
						: 'bg-brand-500 text-white hover:bg-brand-600'
				]}
			>
				{#if data.progress.theory_done === 1}
					<CheckCircle2 size={18} /> Megjelölve készként
				{:else}
					{saving ? 'Mentés…' : 'Megjelölés készként'}
				{/if}
			</button>
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

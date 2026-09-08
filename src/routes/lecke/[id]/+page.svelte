<script lang="ts">
	import { onMount } from 'svelte';
	import { BookOpenText, CheckCircle2, Layers, ListChecks } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import FlashcardPlayer from '$lib/components/FlashcardPlayer.svelte';
	import QuizPlayer from '$lib/components/QuizPlayer.svelte';
	import { renderMarkdown, studyApi, type LessonDetail } from '$lib/study';

	let { params } = $props();

	type Tab = 'theory' | 'cards' | 'quiz';
	let tab = $state<Tab>('theory');
	let data = $state<LessonDetail | null>(null);
	let loading = $state(true);
	let err = $state<string | null>(null);
	let saving = $state(false);

	// Kártya-sor: a "Nem tudom" a végére pörög (cram-jellegű befejezés a leckén belül).
	let queue = $state<string[]>([]);
	let cardIdx = $state(0);
	let cardsFinished = $state(false);

	let quizScore = $state<number | null>(null);
	let quizTotal = $state(0);

	let isLang = $derived(data?.topic.type === 'language');
	let card = $derived(data?.cards.find((c) => c.id === queue[cardIdx]));

	async function load() {
		loading = true;
		err = null;
		try {
			data = await studyApi.lesson(params.id);
			queue = (data.cards ?? []).map((c) => c.id);
			cardIdx = 0;
			cardsFinished = (data.progress.cards_done ?? 0) === 1;
			if ((data.progress.quiz_best ?? 0) > 0) {
				quizScore = data.progress.quiz_best;
				quizTotal = data.quiz.length;
			}
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loading = false;
		}
	}

	onMount(load);

	async function complete(kind: 'theory' | 'cards' | 'quiz', score?: number) {
		if (!auth.user || !data) return;
		saving = true;
		try {
			await studyApi.completeLesson(data.lesson.id, { kind, score });
			await auth.refresh();
			if (data) {
				if (kind === 'theory') data.progress.theory_done = 1;
				if (kind === 'cards') {
					data.progress.cards_done = 1;
					cardsFinished = true;
				}
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

	async function gradeCard(known: boolean) {
		const id = queue[cardIdx];
		if (!id) return;
		if (auth.user) {
			try {
				await studyApi.grade(id, known, false);
			} catch {
				// offline-szerű hiba: a lecke menete helyben folytatódik
			}
		}
		if (!known) queue.push(id);
		if (cardIdx + 1 >= queue.length) {
			await complete('cards');
		} else {
			cardIdx++;
		}
	}

	async function finishQuiz(score: number, total: number) {
		quizScore = total > 0 ? Math.round((score / total) * 100) : 0;
		quizTotal = total;
		await complete('quiz', quizScore);
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

{#if loading}
	<p class="mt-4 text-sm text-stone-500 dark:text-stone-400">Lecke betöltése…</p>
{:else if err && !data}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else if data}
	<nav class="mt-3 text-[13px] text-stone-500 dark:text-stone-400" aria-label="Morzsa">
		<a href="/temakorok" class="hover:underline">Témakörök</a>
		<span> · </span>
		<a href="/temakorok/{data.topic.id}" class="hover:underline">{data.topic.title}</a>
	</nav>
	<h1 class="mt-1 text-[24px] font-extrabold tracking-tight text-ink-900 dark:text-white">{data.lesson.title}</h1>
	<p class="text-sm text-ink-600 dark:text-stone-400">
		{data.topic.category} · {data.topic.type === 'language' ? 'Nyelvi' : 'Tantárgyi'} · {data.cards.length} kártya · {data.quiz.length} kérdés
	</p>

	<div class="mt-4 grid grid-cols-3 gap-2" role="tablist" aria-label="Lecke modulok">
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
		<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
			{#if data.cards.length === 0}
				<p class="text-sm text-stone-500 dark:text-stone-400">Ehhez a leckéhez még nincs kártya.</p>
			{:else if cardsFinished && cardIdx >= queue.length}
				<p class="flex items-center gap-2 text-[15px] font-bold text-emerald-600 dark:text-emerald-400">
					<CheckCircle2 size={17} /> Minden kártyát tudsz! (+10 XP)
				</p>
				<button
					onclick={() => {
						cardIdx = 0;
						queue = (data?.cards ?? []).map((c) => c.id);
						cardsFinished = false;
					}}
					class="mt-3 w-full rounded-full border border-stone-200 px-4 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-stone-50 dark:border-white/10 dark:text-stone-300"
				>
					Újra átforgatom
				</button>
			{:else if card}
				<p class="mb-2 text-xs font-semibold text-ink-400 dark:text-stone-500">{cardIdx + 1} / {queue.length}</p>
				{#key card.id + '-' + cardIdx}
					<FlashcardPlayer card={card} isLanguage={isLang} onGrade={gradeCard} />
				{/key}
			{/if}
		</section>
	{:else}
		<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
			{#if quizScore !== null}
				<p class="mb-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
					Legjobb eredmény: {quizScore}% ({quizTotal} kérdés)
				</p>
			{/if}
			{#key data.lesson.id}
				<QuizPlayer questions={data.quiz} onFinish={finishQuiz} />
			{/key}
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

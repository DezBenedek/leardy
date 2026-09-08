<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { studyApi, type QuizQ } from '$lib/study';

	let { params } = $props();

	let title = $state('');
	let items = $state<QuizQ[]>([]);
	let submissionId = $state('');
	let limitMins = $state(0);
	let startedAt = $state(0);
	let index = $state(0);
	let answers = $state<Record<string, string>>({});
	let text = $state('');
	let loading = $state(true);
	let err = $state<string | null>(null);
	let left = $state('');
	let result = $state<{ score: number; total: number; delayed: boolean; results?: { id: string; correct: boolean; answer: string }[] } | null>(null);
	let submitting = $state(false);

	let q = $derived(items[index]);
	let timer: ReturnType<typeof setInterval> | undefined;

	function tick() {
		if (!limitMins || !startedAt) return;
		const remain = limitMins * 60 - Math.floor((Date.now() - startedAt) / 1000);
		if (remain <= 0) {
			if (timer) clearInterval(timer);
			void submit();
		} else {
			const m = Math.floor(remain / 60);
			const s = remain % 60;
			left = `${m}:${String(s).padStart(2, '0')}`;
		}
	}

	onMount(() => {
		let cancelled = false;
		(async () => {
			try {
				const data = await studyApi.startSubmission(params.aid);
				if (cancelled) return;
				title = data.title;
				items = data.items as QuizQ[];
				submissionId = data.submission_id;
				limitMins = data.time_limit_mins;
				startedAt = data.started_at;
				tick();
				if (limitMins > 0) timer = setInterval(tick, 1000);
			} catch (e) {
				if (!cancelled) err = e instanceof Error ? e.message : 'Hiba történt.';
			} finally {
				if (!cancelled) loading = false;
			}
		})();
		return () => {
			cancelled = true;
			if (timer) clearInterval(timer);
		};
	});

	function choose(v: string) {
		if (!q || result) return;
		answers[q.id] = v;
		if (index + 1 < items.length) index++;
		else void submit();
	}

	function submitText(e: SubmitEvent) {
		e.preventDefault();
		if (!q || result) return;
		answers[q.id] = text.trim();
		text = '';
		if (index + 1 < items.length) index++;
		else void submit();
	}

	async function submit() {
		if (submitting || result) return;
		submitting = true;
		try {
			result = await studyApi.submitAssignment(params.aid, { submission_id: submissionId, answers: { ...answers } });
			if (timer) clearInterval(timer);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>{title || 'Dolgozat'} — Leardy</title>
</svelte:head>

<nav class="mt-3 text-[13px] text-stone-500 dark:text-stone-400" aria-label="Morzsa">
	<a href="/tanterem" class="hover:underline">Tanterem</a>
</nav>
<h1 class="mt-1 text-[24px] font-extrabold tracking-tight text-ink-900 dark:text-white">{title || 'Dolgozat'}</h1>

{#if loading}
	<p class="mt-4 text-sm text-stone-500 dark:text-stone-400">Feladatsor betöltése…</p>
{:else if err && items.length === 0}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
	<button onclick={() => goto('/tanterem')} class="mt-3 text-sm font-semibold text-brand-600 dark:text-brand-400">← Vissza a tanterembe</button>
{:else if result}
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 text-center sm:p-6 dark:border-white/10 dark:bg-stone-900">
		{#if result.delayed}
			<p class="font-display text-[22px] font-extrabold text-ink-900 dark:text-white">Beadva ✓</p>
			<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Az eredményt a tanár a határidő lejárta után mutatja meg.</p>
		{:else}
			<p class="font-display text-[28px] font-extrabold text-ink-900 dark:text-white">{result.score} / {result.total}</p>
			<ul class="mt-3 space-y-1.5 text-left">
				{#each items as it, i (it.id)}
					{@const r = result.results?.find((x) => x.id === it.id)}
					<li class="text-sm {r?.correct ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}">
						{i + 1}. {it.question_text} — {r?.correct ? 'helyes' : `helytelen (helyes: ${r?.answer ?? '?'})`}
					</li>
				{/each}
			</ul>
		{/if}
		<button onclick={() => goto('/tanterem')} class="mt-4 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600">
			Vissza a tanterembe
		</button>
	</section>
{:else if q}
	{#if limitMins > 0}
		<p class="mt-2 inline-block rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-700 dark:bg-red-400/10 dark:text-red-300">
			Hátralévő idő: {left || `${limitMins}:00`}
		</p>
	{/if}
	{#if err}
		<p role="alert" class="mt-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
	{/if}
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<p class="text-xs font-semibold text-ink-400 dark:text-stone-500">{index + 1} / {items.length}</p>
		<div class="mt-2 rounded-2xl border border-stone-200 bg-stone-100 p-5 dark:border-white/10 dark:bg-white/5">
			{#if q.type === 'match'}
				<p class="text-[13px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Párosítás</p>
				<p class="mt-1 text-xl font-extrabold text-ink-900 dark:text-white">{q.left} → ?</p>
			{:else}
				<p class="text-xl font-extrabold text-ink-900 dark:text-white">{q.question_text}</p>
			{/if}
		</div>
		{#if q.type === 'text'}
			<form onsubmit={submitText} class="mt-3 flex gap-2">
				<input
					bind:value={text}
					placeholder="Írd be a választ…"
					autocomplete="off"
					class="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] dark:border-white/15 dark:bg-white/5 dark:text-white"
				/>
				<button type="submit" class="shrink-0 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white">Tovább</button>
			</form>
		{:else}
			<div class="mt-3 grid gap-2">
				{#each q.options as opt (opt)}
					<button
						onclick={() => choose(opt)}
						class="rounded-xl border border-stone-200 bg-white px-4 py-3 text-left text-[15px] font-medium transition hover:border-brand-500 hover:bg-brand-50 dark:border-white/10 dark:bg-transparent dark:text-white"
					>
						{opt}
					</button>
				{/each}
			</div>
		{/if}
		<button
			onclick={() => void submit()}
			disabled={submitting}
			class="mt-4 w-full rounded-full border border-stone-300 px-4 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-stone-50 disabled:opacity-60 dark:border-white/15 dark:text-stone-300"
		>
			{submitting ? 'Beadás…' : 'Beadom most'}
		</button>
	</section>
{/if}

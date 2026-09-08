<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft, FileText, Play } from '@lucide/svelte';
	import { invalidate } from '$lib/cache';
	import { player } from '$lib/player.svelte';
	import { studyApi, QueuedOffline, type QuizQ } from '$lib/study';

	let { params } = $props();

	let title = $state('Dolgozat');
	let starting = $state(false);
	let submitting = $state(false);
	let pendingOffline = $state(false);
	let err = $state<string | null>(null);
	let result = $state<{
		score: number;
		total: number;
		delayed: boolean;
		results?: { id: string; correct: boolean; answer: string }[];
		items: QuizQ[];
	} | null>(null);

	async function start() {
		if (starting) return;
		starting = true;
		err = null;
		try {
			const data = await studyApi.startSubmission(params.aid);
			title = data.title;
			player.openQuiz({
				title: data.title,
				subtitle: 'Éles dolgozat',
				questions: data.items as QuizQ[],
				reveal: false,
				timeLimitMins: data.time_limit_mins,
				startedAt: data.started_at,
				submitLabel: 'Beadás',
				onFinish: async (_score, _total, answers) => {
					submitting = true;
					try {
						const r = await studyApi.submitAssignment(params.aid, {
							submission_id: data.submission_id,
							answers
						});
						result = { ...r, items: data.items as QuizQ[] };
						invalidate('assignments');
					} catch (e) {
						if (e instanceof QueuedOffline) {
							// Offline beadás: sorba állt, az eredmény a Tanteremben jelenik meg.
							pendingOffline = true;
						} else {
							err = e instanceof Error ? e.message : 'Hiba történt.';
						}
					} finally {
						submitting = false;
					}
				}
			});
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			starting = false;
		}
	}
</script>

<svelte:head>
	<title>{title} — Leardy</title>
</svelte:head>

<div class="mt-3 flex items-center gap-2">
	<a
		href="/tanterem"
		aria-label="Vissza a tanterembe"
		class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-900 transition hover:bg-stone-50 active:scale-95 dark:border-white/10 dark:bg-stone-900 dark:text-white"
	>
		<ArrowLeft size={20} />
	</a>
	<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">{title}</h1>
</div>

{#if err}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{/if}

{#if submitting}
	<p class="animate-pulse mt-4 text-sm text-stone-500 dark:text-stone-400">Beadás, pontozás…</p>
{:else if pendingOffline}
	<section class="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
		<p class="font-display text-[22px] font-extrabold text-amber-800 dark:text-amber-200">Beadva offline ✓</p>
		<p class="mt-1 text-sm text-amber-700 dark:text-amber-300">
			Automatikusan beküldjük, ha újra online leszel. Az eredmény a Tanteremben jelenik meg.
		</p>
		<button onclick={() => goto('/tanterem')} class="mt-4 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white">
			Vissza a tanterembe
		</button>
	</section>
{:else if result}
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 text-center sm:p-6 dark:border-white/10 dark:bg-stone-900">
		{#if result.delayed}
			<p class="font-display text-[22px] font-extrabold text-ink-900 dark:text-white">Beadva ✓</p>
			<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Az eredményt a tanár a határidő lejárta után mutatja meg.</p>
		{:else}
			<p class="font-display text-[32px] font-extrabold text-ink-900 dark:text-white">{result.score} / {result.total}</p>
			<ul class="mt-3 space-y-1.5 text-left">
				{#each result.items as it, i (it.id)}
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
{:else}
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-6 text-center dark:border-white/10 dark:bg-stone-900">
		<span class="mx-auto grid size-14 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-300">
			<FileText size={26} />
		</span>
		<h2 class="font-display mt-3 text-[20px] font-bold text-ink-900 dark:text-white">Éles kitöltés</h2>
		<p class="mx-auto mt-1 max-w-xs text-sm text-stone-500 dark:text-stone-400">
			Teljes képernyőn nyílik. Kilépéskor a be nem adott válaszok elvesznek (a próbálkozás nem).
		</p>
		<button
			onclick={() => void start()}
			disabled={starting}
			class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99] disabled:opacity-60"
		>
			<Play size={18} fill="currentColor" /> {starting ? 'Indítás…' : 'Kitöltés indítása'}
		</button>
	</section>
{/if}

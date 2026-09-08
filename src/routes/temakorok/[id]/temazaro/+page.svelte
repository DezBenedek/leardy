<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowLeft, Play } from '@lucide/svelte';
	import { invalidate } from '$lib/cache';
	import { player } from '$lib/player.svelte';
	import { studyApi, type ExamLast, type QuizQ } from '$lib/study';

	let { params } = $props();

	let title = $state('');
	let quiz = $state<QuizQ[]>([]);
	let lessonMap = $state<Record<string, string>>({});
	let last = $state<ExamLast | null>(null);
	let loading = $state(true);
	let err = $state<string | null>(null);

	function open() {
		if (quiz.length === 0) return;
		player.openQuiz({
			title: 'Témazáró gyakorlás',
			subtitle: title,
			questions: quiz,
			reveal: true,
			onFinish: async (score, total, answers) => {
				// Leckénkénti hibák számolása a naplózáshoz.
				const byLesson: Record<string, { wrong: number; total: number }> = {};
				for (const qq of quiz) {
					const lid = qq.lesson_id ?? '';
					if (!lid) continue;
					byLesson[lid] ??= { wrong: 0, total: 0 };
					byLesson[lid].total++;
					if ((answers[qq.id] ?? '') !== qq.correct_answer) byLesson[lid].wrong++;
				}
				try {
					await studyApi.submitExam(params.id, { score, total, mistakes: byLesson });
					invalidate(`topic:${params.id}`);
				} catch {
					// az eredmény helyben így is látszik
				}
				last = {
					score,
					total,
					created_at: Date.now(),
					mistakes: Object.entries(byLesson)
						.filter(([, m]) => m.wrong > 0)
						.map(([lesson_id, m]) => ({
							lesson_id,
							title: lessonTitle(lesson_id),
							wrong: m.wrong,
							total: m.total
						}))
				};
			}
		});
	}

	function lessonTitle(lid: string): string {
		return lessonMap[lid] ?? last?.mistakes.find((m) => m.lesson_id === lid)?.title ?? 'Lecke';
	}

	function fmtDate(ts: number): string {
		return new Date(ts).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	onMount(async () => {
		try {
			const data = await studyApi.exam(params.id);
			title = data.topic.title;
			quiz = data.quiz;
			lessonMap = Object.fromEntries((data.lessons ?? []).map((l) => [l.id, l.title]));
			last = data.last;
			// Még sosem töltötted: egyből nyílik a lejátszó.
			if (!last && quiz.length > 0) open();
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

<div class="mt-3 flex items-center gap-2">
	<a
		href="/temakorok/{params.id}"
		aria-label="Vissza a témakörhöz"
		class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-900 transition hover:bg-stone-50 active:scale-95 dark:hover:bg-white/10 dark:border-white/10 dark:bg-stone-900 dark:text-white"
	>
		<ArrowLeft size={20} />
	</a>
	<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Témazáró</h1>
</div>
<p class="mt-1 text-sm text-ink-600 dark:text-stone-400">{title} · {quiz.length} kérdés keverve</p>

{#if loading}
	<p class="animate-pulse mt-4 text-sm text-stone-500 dark:text-stone-400">Kérdések összeállítása…</p>
{:else if err && quiz.length === 0}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else}
	{#if last}
		<section class="anim-rise mt-3 rounded-2xl border border-stone-200 bg-white p-5 text-center dark:border-white/10 dark:bg-stone-900" aria-label="Legutóbbi eredmény">
			<p class="text-[13px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
				Legutóbbi · {fmtDate(last.created_at)}
			</p>
			<p class="font-display mt-1 text-[40px] leading-none font-extrabold text-ink-900 tabular-nums dark:text-white">
				{last.score} <span class="text-[20px] text-stone-400">/ {last.total}</span>
			</p>
			{#if last.mistakes.length > 0}
				<ul class="mt-4 space-y-1.5 text-left">
					{#each last.mistakes as m (m.lesson_id)}
						<li>
							<a
								href="/lecke/{m.lesson_id}"
								class="flex items-center justify-between gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 transition hover:bg-red-100 dark:bg-red-400/10 dark:hover:bg-red-400/20"
							>
								<span class="truncate text-sm font-semibold text-red-800 dark:text-red-200">{m.title}</span>
								<span class="shrink-0 text-sm font-extrabold text-red-600 tabular-nums dark:text-red-300">
									{m.wrong} hiba
								</span>
							</a>
						</li>
					{/each}
				</ul>
				<p class="mt-2 text-[13px] text-stone-500 dark:text-stone-400">Koppints egy leckére a pótláshoz!</p>
			{:else}
				<p class="mt-2 text-sm font-bold text-emerald-600 dark:text-emerald-300">Hibátlan! 🎉</p>
			{/if}
			<button
				onclick={open}
				class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink-900 py-3 text-[15px] font-bold text-white transition hover:opacity-90 active:scale-[0.99] dark:bg-white dark:text-ink-900"
			>
				<Play size={18} fill="currentColor" /> Újra
			</button>
		</section>
	{:else}
		<section class="anim-rise mt-3 rounded-2xl border border-stone-200 bg-white p-6 text-center dark:border-white/10 dark:bg-stone-900">
			<p class="font-display text-[40px] leading-none font-extrabold text-ink-900 tabular-nums dark:text-white">{quiz.length}</p>
			<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">kérdés vár</p>
			<button
				onclick={open}
				class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink-900 py-3 text-[15px] font-bold text-white transition hover:opacity-90 active:scale-[0.99] dark:bg-white dark:text-ink-900"
			>
				<Play size={18} fill="currentColor" /> Indítás
			</button>
		</section>
	{/if}
{/if}

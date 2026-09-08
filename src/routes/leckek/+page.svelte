<script lang="ts">
	import { BookOpenText, CheckCircle2, Circle, Lock } from '@lucide/svelte';
	import { language } from '$lib/language.svelte';
	import { LANGUAGES } from '$lib/languages';
	import { CONTENT } from '$lib/content';

	let content = $derived(CONTENT[language.code]);
	let langName = $derived(LANGUAGES.find((l) => l.code === language.code)?.name ?? '');
	let stats = $derived(content.stats);
	let pct = $derived(Math.round((stats.lessonsDone / stats.lessonsTotal) * 100));
</script>

<svelte:head>
	<title>Leckék — Leardy</title>
</svelte:head>

<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
	<div class="flex items-center gap-3.5">
		<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white">
			<BookOpenText size={22} />
		</span>
		<div>
			<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Leckék · {langName}</h1>
			<p class="text-sm text-ink-600 dark:text-stone-400">
				{stats.lessonsDone} / {stats.lessonsTotal} lecke kész
			</p>
		</div>
	</div>
	<div class="mt-4 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10">
		<div class="h-full rounded-full bg-brand-500" style="width: {pct}%"></div>
	</div>
</section>

<div class="mt-3 space-y-3">
	{#each content.chapters as ch (ch.title)}
		<section class="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
			<h2 class="text-[16px] font-bold text-ink-900 dark:text-white">{ch.title}</h2>
			<p class="mt-0.5 text-sm text-ink-600 dark:text-stone-400">{ch.desc}</p>
			<ul class="mt-3 divide-y divide-stone-100 dark:divide-white/5">
				{#each ch.lessons as l (l.title)}
					<li class="flex items-center gap-3.5 py-3">
						{#if l.done}
							<CheckCircle2 size={22} class="shrink-0 text-emerald-500" />
						{:else if l.locked}
							<Lock size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
						{:else}
							<Circle size={22} class="shrink-0 text-brand-500" />
						{/if}
						<div class="min-w-0 flex-1">
							<p class={['truncate text-[15px] font-semibold', l.locked ? 'text-ink-400 dark:text-stone-500' : 'text-ink-900 dark:text-white']}>
								{l.title}
							</p>
							<p class="text-[13px] text-ink-400 dark:text-stone-500">{l.meta}</p>
						</div>
						{#if l.current}
							<span class="shrink-0 rounded-full bg-brand-500 px-3.5 py-1.5 text-[13px] font-semibold text-white">Folytatás</span>
						{:else if !l.locked && !l.done}
							<span class="shrink-0 rounded-full bg-stone-100 px-3.5 py-1.5 text-[13px] font-semibold text-ink-600 dark:bg-white/10 dark:text-stone-300">Start</span>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>

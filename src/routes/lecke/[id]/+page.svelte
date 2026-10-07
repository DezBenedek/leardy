<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { ArrowLeft, ChevronDown, ChevronRight, Dices, Layers } from '@lucide/svelte';
	import QuizModal from '$lib/components/QuizModal.svelte';
	import QuizRunner from '$lib/components/QuizRunner.svelte';
	import type { Package, QuizQuestion } from '$lib/curriculum';
	import { markLessonOpened } from '$lib/lesson-history';
	import { markLessonDone } from '$lib/query.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import { renderMarkdown, splitSections } from '$lib/markdown';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let lessonPage = $derived(data.lessonPage);

	let sections = $derived(splitSections(lessonPage.lesson.body_md));
	let allQuestions = $derived(lessonPage.quizzes.flatMap((q) => q.questions));

	/** Az első szekció alapból nyitva. Zárva indul, majd az első
		paint után nyílik le, így a lenyílás animáció látszik. */
	let openSecs = $state<Record<string, boolean>>({});
	let initedFor = $state('');

	$effect(() => {
		const id = lessonPage.lesson.id;
		const first = sections[0]?.slug;
		if (!first || initedFor === id) return;
		initedFor = id;
		openSecs = {};
		// Két frame késleltetés: az első paint még csukva történik,
		// utána a 0fr -> 1fr átmenet animálva lenyílik.
		// (Csökkentett mozgásnál a CSS transition none, így azonnal nyílik.)
		void (async () => {
			await tick();
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					if (initedFor !== id) return;
					openSecs = { [first]: true };
				});
			});
		})();
	});

	/** Nagy modalban megnyitott kvíz. */
	let quizModal = $state<{ title: string; questions: QuizQuestion[] } | null>(null);

	/* Utoljára megnyitott lecke naplózása a Tanulás oldal Folytatás gombjához. */
	$effect(() => {
		const id = lessonPage.lesson.id;
		const title = lessonPage.lesson.title;
		if (id) markLessonOpened(id, title);
	});

	function sectionQuizCount(slug: string): number {
		return lessonPage.quizzes
			.filter((q) => q.section_slug === slug)
			.reduce((n, q) => n + q.questions.length, 0);
	}

	function sectionQuestions(slug: string): QuizQuestion[] {
		return lessonPage.quizzes
			.filter((q) => q.section_slug === slug)
			.flatMap((q) => q.questions);
	}

	function goBack() {
		if (typeof history !== 'undefined' && history.length > 1) history.back();
		else void goto('/tanulas');
	}

	async function reportProgress(score: number, total: number) {
		try {
			const res = await fetch('/api/progress', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lessonId: lessonPage.lesson.id, done: 1, score, total })
			});
			if (res.ok) markLessonDone(lessonPage.lesson.id);
		} catch {
			// néma hiba
		}
	}

	/** A leckéhez csatolt saját csomagok. */
	let related = $state<Package[]>([]);

	onMount(async () => {
		try {
			const res = await fetch(`/api/packages?attachedTo=${encodeURIComponent(lessonPage.lesson.id)}`);
			const j = await res.json();
			related = res.ok ? (j.packages ?? []) : [];
		} catch {
			related = [];
		}
	});
</script>

<svelte:head>
	<title>{lessonPage.lesson.title} | Leardy</title>
	<meta name="description" content="{lessonPage.lesson.title} lecke." />
</svelte:head>

<div class="flex items-center gap-2 px-1">
	<IconButton ariaLabel="Vissza" size={44} onclick={goBack}>
		<ArrowLeft size={21} />
	</IconButton>
	<div class="flex min-w-0 flex-1 items-center">
		<h1 class="font-display min-w-0 flex-1 text-[26px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
			{lessonPage.lesson.title}
		</h1>
	</div>
	{#if allQuestions.length > 0}
		<IconButton
			ariaLabel="Teljes lecke kvíz: {allQuestions.length} kérdés"
			title="Teljes lecke kvíz"
			size={44}
			onclick={() => (quizModal = { title: 'Teljes lecke kvíz', questions: allQuestions })}
		>
			<Dices size={20} />
		</IconButton>
	{/if}
</div>

<div class="leardy-md mt-3 grid min-w-0 gap-2.5">
	{#each sections as section (section.slug)}
		{@const count = sectionQuizCount(section.slug)}
		{@const open = openSecs[section.slug] ?? false}
		<div class="rounded-[20px] border border-stone-200 bg-white transition-shadow dark:border-white/10 dark:bg-stone-900 {open ? 'shadow-sm' : ''}">
			<div class="flex items-center gap-1 p-1.5">
				<button
					type="button"
					aria-expanded={open}
					onclick={() => (openSecs[section.slug] = !open)}
					class="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-white/5 dark:active:bg-white/10"
				>
					<span class="min-w-0 flex-1 text-[16px] font-bold text-ink-900 dark:text-white">
						{section.title}
					</span>
					<ChevronDown
						size={18}
						class={[
							'shrink-0 text-stone-400 transition-transform duration-300 motion-reduce:transition-none',
							open ? 'rotate-180' : ''
						]}
						aria-hidden="true"
					/>
				</button>
				{#if count > 0}
					<IconButton
						ariaLabel="Szekció kvíz: {count} kérdés"
						title="Szekció kvíz"
						size={36}
						onclick={() =>
							(quizModal = { title: `${section.title}: kvíz`, questions: sectionQuestions(section.slug) })}
					>
						<Dices size={16} />
					</IconButton>
				{/if}
			</div>
			<div
				class="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
				style="grid-template-rows: {open ? '1fr' : '0fr'}"
			>
				<div class="min-h-0 overflow-hidden">
					<div class="leardy-md border-t border-stone-100 px-4 py-4 dark:border-white/5">
						{@html renderMarkdown(section.md)}
					</div>
				</div>
			</div>
		</div>
	{/each}
</div>

{#if related.length > 0}
	<section aria-label="Kártyacsomagok" class="mt-4">
		<h2 class="font-display px-1 text-[17px] font-extrabold tracking-tight text-ink-900 dark:text-white">
			Kártyacsomagok
		</h2>
		<div class="mt-2 grid gap-2">
			{#each related as pkg (pkg.quizId)}
				<a
					href="/kartyak/{encodeURIComponent(pkg.quizId)}"
					class="group flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 transition hover:border-brand-300 hover:shadow-sm active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 dark:border-white/10 dark:bg-stone-900 dark:hover:border-white/20"
				>
					<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300" aria-hidden="true">
						<Layers size={18} />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">
							{pkg.title}
						</span>
						<span class="mt-0.5 block text-[12px] font-medium text-stone-500 dark:text-stone-400">
							{pkg.mine ? 'Saját' : 'Hivatalos'} kártyacsomag · {pkg.questionCount} kártya
						</span>
					</span>
					<ChevronRight size={17} class="shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500 motion-reduce:transition-none dark:text-stone-600" />
				</a>
			{/each}
		</div>
	</section>
{/if}

<QuizModal open={quizModal !== null} label={quizModal?.title ?? 'Kvíz'} title={quizModal?.title} onClose={() => (quizModal = null)}>
	{#if quizModal}
		{#key quizModal.title + quizModal.questions.map((q) => q.id).join(',')}
			<QuizRunner
				questions={quizModal.questions}
				title={quizModal.title}
				onDone={(score, total) => reportProgress(score, total)}
			/>
		{/key}
	{/if}
</QuizModal>

<style>
	.leardy-md :global(h2),
	.leardy-md :global(h3) {
		font-weight: 800;
		letter-spacing: -0.01em;
		color: inherit;
	}
	.leardy-md :global(h2) {
		font-size: 1.15rem;
		margin: 0.25rem 0 0.5rem;
	}
	.leardy-md :global(h3) {
		font-size: 1.02rem;
		margin: 0.75rem 0 0.4rem;
	}
	.leardy-md :global(p) {
		font-size: 0.95rem;
		line-height: 1.7;
		color: var(--color-ink-600, #44403c);
		margin: 0.4rem 0;
	}
	:global(.dark) .leardy-md :global(p) {
		color: var(--color-stone-300, #d6d3d1);
	}
	.leardy-md :global(ul) {
		list-style: disc;
		padding-left: 1.4rem;
		margin: 0.5rem 0;
		display: grid;
		gap: 0.3rem;
		font-size: 0.95rem;
		line-height: 1.65;
	}
</style>

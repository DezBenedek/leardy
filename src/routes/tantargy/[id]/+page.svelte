<script lang="ts">
	import { ArrowLeft, BookOpenText, Check, ChevronRight, Landmark, Languages, Layers, Leaf, Shapes } from '@lucide/svelte';
	import Card from '$lib/ui/Card.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** DB-ben tárolt ikon-sztring → lucide-komponens; ismeretlenhez fallback. */
	const subjectIcons: Record<string, typeof Landmark> = {
		landmark: Landmark,
		leaf: Leaf,
		languages: Languages,
		book: BookOpenText
	};

	let tree = $derived(data.tree);
	let Icon = $derived(subjectIcons[tree.icon] ?? Shapes);
	let levelLow = $derived((tree.levelLabel || 'Szint').toLowerCase());
</script>

<svelte:head>
	<title>{tree.title} | Leardy</title>
	<meta name="description" content="{tree.title}: tananyagok és leckék." />
</svelte:head>

<nav aria-label="Morzsa" class="px-1">
	<a
		href="/"
		class="inline-flex items-center gap-1.5 text-[13px] font-bold text-stone-500 transition hover:text-ink-900 dark:text-stone-400 dark:hover:text-white"
	>
		<ArrowLeft size={15} /> Vissza a tantárgyakhoz
	</a>
</nav>

<header class="mt-2 flex items-center gap-3 px-1">
	<span class="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300">
		<Icon size={28} aria-hidden="true" />
	</span>
	<div class="min-w-0">
		<h1 class="font-display truncate text-[26px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
			{tree.title}
		</h1>
		<p class="text-[13px] font-medium text-stone-500 dark:text-stone-400">
			{tree.levelCount} {levelLow} · {tree.lessonCount} lecke
		</p>
	</div>
</header>

{#if tree.levels.length === 0}
	<Card pad="lg">
		<p class="text-[15px] font-bold text-ink-900 dark:text-white">Még nincs {levelLow} ehhez a tantárgyhoz.</p>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">A tananyagok feltöltés alatt vannak.</p>
	</Card>
{:else}
	<div class="mt-4 grid gap-4">
		{#each tree.levels as level (level.id)}
			<section aria-label={level.title}>
				<h2 class="flex items-center gap-2 px-1 text-[17px] font-extrabold text-ink-900 dark:text-white">
					<Layers size={17} class="text-brand-500" /> {level.title}
				</h2>
				{#if level.materials.length === 0}
					<p class="mt-1.5 px-1 text-sm text-stone-500 dark:text-stone-400">Még nincs tananyag.</p>
				{:else}
					<div class="mt-2 grid gap-2.5">
						{#each level.materials as mat (mat.id)}
							<Card>
								<p class="text-[15px] font-bold text-ink-900 dark:text-white">{mat.title}</p>
								{#if mat.lessons.length === 0}
									<p class="mt-1 text-[13px] text-stone-500 dark:text-stone-400">Még nincs lecke.</p>
								{:else}
									<ul class="mt-1.5 divide-y divide-stone-100 dark:divide-white/5">
										{#each mat.lessons as lesson (lesson.id)}
											<li>
												<a
													href="/lecke/{lesson.id}"
													class="group flex items-center gap-2 py-2 text-[14px] font-medium text-ink-600 transition hover:text-brand-600 dark:text-stone-300 dark:hover:text-white"
												>
													{#if lesson.done}
													<span class="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white" aria-label="Teljesítve">
														<Check size={13} strokeWidth={3.5} aria-hidden="true" />
													</span>
												{/if}
												<span class="min-w-0 flex-1 truncate">{lesson.title}</span>
													<ChevronRight size={16} class="shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-stone-600" />
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							</Card>
						{/each}
					</div>
				{/if}
			</section>
		{/each}
	</div>
{/if}

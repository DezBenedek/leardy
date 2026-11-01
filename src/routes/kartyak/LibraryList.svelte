<script lang="ts">
	import { ChevronRight, Layers } from '@lucide/svelte';
	import type { Package } from '$lib/curriculum/curriculum';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';

	interface Props {
		loading: boolean;
		libraryEmpty: boolean;
		visible: Package[];
		describe: (p: Package) => string;
		onNavigate: () => void;
	}

	let { loading, libraryEmpty, visible, describe, onNavigate }: Props = $props();
</script>

<div data-tutorial="cards-overview" class="mt-4">
	{#if loading}
		<div role="status" aria-label="Betöltés" class="grid gap-2">
			{#each [0, 1, 2, 3] as i (i)}
				<div class="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 dark:border-white/10 dark:bg-stone-900">
					<Skeleton cls="size-9 shrink-0 rounded-xl" />
					<div class="min-w-0 flex-1 space-y-1.5">
						<Skeleton cls="h-4 w-3/4 rounded-md" />
						<Skeleton cls="h-3 w-1/2 rounded-md" />
					</div>
					<Skeleton cls="size-4 shrink-0 rounded-full" />
				</div>
			{/each}
			<span class="sr-only">Betöltés…</span>
		</div>
	{:else if libraryEmpty}
		<EmptyState
			title="Üres a könyvtár"
			description="A + gombbal létrehozhatsz saját csomagot, vagy válogathatsz a felfedezésben."
		/>
	{:else if visible.length === 0}
		<EmptyState
			title="Nincs találat"
			description="Próbálj másik keresést, vagy állíts a szűrőkön."
		/>
	{:else}
		<p class="mb-2 text-[12px] font-bold text-stone-400 tabular-nums dark:text-stone-500">
			{visible.length} csomag
		</p>
		<div class="grid gap-2">
			{#each visible as pkg (pkg.quizId)}
				<a
					href="/kartyak/{encodeURIComponent(pkg.quizId)}"
					onclick={onNavigate}
					class="group flex items-center gap-3 overflow-hidden rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 transition hover:border-brand-300 hover:shadow-sm active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 dark:border-white/10 dark:bg-stone-900 dark:hover:border-white/20"
				>
					<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300" aria-hidden="true">
						<Layers size={18} />
					</span>
					<span class="min-w-0 flex-1">
						<span class="font-display block line-clamp-2 text-[15px] leading-snug font-extrabold text-ink-900 dark:text-white">
							{pkg.title}
						</span>
						<span class="mt-0.5 block truncate text-[12px] font-medium text-stone-500 dark:text-stone-400">
							{describe(pkg)}
						</span>
					</span>
					<ChevronRight size={17} class="shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500 motion-reduce:transition-none dark:text-stone-600" />
				</a>
			{/each}
		</div>
	{/if}
</div>

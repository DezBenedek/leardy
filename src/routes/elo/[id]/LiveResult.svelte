<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import { ChevronRight, Trophy } from '@lucide/svelte';

	interface Props {
		title: string;
		teacher: boolean;
		myScore: number;
		myTotal: number;
		ranking: { name: string; score: number; userId?: string }[];
		wizardHref: string;
		onDetail: (userId: string | null) => void;
	}

	let { title, teacher, myScore, myTotal, ranking, wizardHref, onDetail }: Props = $props();
</script>

<div class="mt-4 grid gap-2.5">
	<Card tone="brand">
		<div class="anim-rise flex flex-col items-center py-4 text-center" style="--d:0ms">
			<span class="grid size-14 place-items-center rounded-full bg-white/15" aria-hidden="true">
				<Trophy size={26} class="text-white" />
			</span>
			<p class="mt-3 text-[11px] font-extrabold tracking-[0.14em] text-white/70 uppercase">Végeredmény</p>
			<h2 class="font-display mt-1 text-[22px] font-extrabold tracking-tight text-white">{title}</h2>
			{#if !teacher}
				<p class="mt-1 text-[15px] font-bold text-white">
					Saját pont: <span class="tabular-nums">{myScore}/{myTotal}</span>
				</p>
			{/if}
		</div>
	</Card>

	<Card>
		<div class="anim-rise" style="--d:60ms">
			<h3 class="text-[15px] font-extrabold text-ink-900 dark:text-white">Rangsor</h3>
			{#if ranking.length === 0}
				<p class="mt-1 text-[13px] font-medium text-stone-500 dark:text-stone-400">
					Nincs eredmény.
				</p>
			{:else}
				<ol class="mt-2 grid gap-1.5">
					{#each ranking as row, i (row.userId + ':' + i)}
						<li>
							{#if teacher}
								<button
									type="button"
									onclick={() => onDetail(row.userId ?? null)}
									class="anim-rise flex w-full items-center gap-2.5 rounded-xl bg-stone-100 px-3 py-2 text-left transition hover:bg-stone-200/70 active:scale-[0.99] motion-reduce:transition-none dark:bg-white/5 dark:hover:bg-white/10"
									style="--d:{100 + i * 40}ms"
								>
									<span class="w-6 shrink-0 text-center text-[13px] font-extrabold text-stone-400 tabular-nums dark:text-stone-500">
										{i + 1}.
									</span>
									{#if i === 0}
										<Trophy size={16} class="shrink-0 text-amber-500" aria-hidden="true" />
									{/if}
									<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
										{row.name}
									</span>
									<span class="shrink-0 text-[14px] font-extrabold text-ink-900 tabular-nums dark:text-white">
										{row.score}
									</span>
									<ChevronRight size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
								</button>
							{:else}
								<div class="anim-rise flex items-center gap-2.5 rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/5" style="--d:{100 + i * 40}ms">
									<span class="w-6 shrink-0 text-center text-[13px] font-extrabold text-stone-400 tabular-nums dark:text-stone-500">
										{i + 1}.
									</span>
									{#if i === 0}
										<Trophy size={16} class="shrink-0 text-amber-500" aria-hidden="true" />
									{/if}
									<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
										{row.name}
									</span>
									<span class="shrink-0 text-[14px] font-extrabold text-ink-900 tabular-nums dark:text-white">
										{row.score}
									</span>
								</div>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</Card>

	{#if teacher}
		<div class="anim-rise" style="--d:120ms">
			<Button size="lg" block href={wizardHref}>Újra-meghirdetés</Button>
		</div>
	{:else}
		<div class="anim-rise" style="--d:120ms">
			<Button variant="tint" size="lg" block onclick={() => void goto('/tanterem')}>Vissza az osztályokhoz</Button>
		</div>
	{/if}
</div>

<script lang="ts">
	import { ChevronLeft, ChevronRight, Flame } from '@lucide/svelte';
	import type { DayActivity } from '$lib/study';

	interface Props {
		week: DayActivity[];
		streak: number;
	}

	let { week, streak }: Props = $props();

	let strip: HTMLElement | null = $state(null);
	let sel = $state<number>(-1); // -1 = ma (utolsó nap)

	let n = $derived(week.length);
	let idx = $derived(sel < 0 ? n - 1 : Math.min(sel, n - 1));
	let cur = $derived(n > 0 ? week[idx] : undefined);
	let maxXp = $derived(Math.max(1, ...week.map((d) => d.xp)));
	let total = $derived(week.reduce((s, d) => s + d.xp, 0));
	let activeDays = $derived(week.filter((d) => d.xp > 0).length);
	let best = $derived(week.reduce<DayActivity | null>((b, d) => (!b || d.xp > b.xp ? d : b), null));

	function dayLetter(day: string): string {
		try {
			return new Date(day + 'T12:00:00').toLocaleDateString('hu-HU', { weekday: 'narrow' });
		} catch {
			return '';
		}
	}

	function dayNum(day: string): string {
		try {
			return new Date(day + 'T12:00:00').toLocaleDateString('hu-HU', { day: 'numeric' });
		} catch {
			return '';
		}
	}

	function fullDate(day: string): string {
		try {
			return new Date(day + 'T12:00:00').toLocaleDateString('hu-HU', {
				month: 'long',
				day: 'numeric',
				weekday: 'long'
			});
		} catch {
			return day;
		}
	}

	function scrollBy(dir: 1 | -1) {
		strip?.scrollBy({ left: dir * 220, behavior: 'smooth' });
	}

	function scrollToday(animate = true) {
		if (!strip) return;
		strip.scrollTo({ left: strip.scrollWidth, behavior: animate ? 'smooth' : 'auto' });
	}

	// Betöltéskor és új adatnál ugrás a mához (jobb szélre).
	$effect(() => {
		void week.length;
		requestAnimationFrame(() => scrollToday(false));
	});
</script>

<section class="rounded-[20px] bg-stone-100 p-4 dark:bg-white/5" aria-label="Aktivitás">
	<div class="flex items-center gap-2">
		<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-500/15 text-orange-500 dark:text-orange-300">
			<Flame size={19} />
		</span>
		<div class="min-w-0 flex-1">
			<h2 class="text-[15px] font-bold text-ink-900 dark:text-white">
				Aktivitás <span class="font-semibold text-stone-400 tabular-nums">· {n} nap</span>
			</h2>
			<p class="text-[13px] font-medium text-stone-500 tabular-nums dark:text-stone-400">
				{total} XP · {activeDays} aktív nap · {streak} napos sorozat
			</p>
		</div>
		<div class="flex shrink-0 gap-1">
			<button
				onclick={() => scrollBy(-1)}
				aria-label="Vissza az időben"
				class="grid size-8 place-items-center rounded-full text-stone-400 transition hover:bg-stone-200/70 active:scale-95 dark:hover:bg-white/10"
			>
				<ChevronLeft size={18} />
			</button>
			<button
				onclick={() => scrollBy(1)}
				aria-label="Előre az időben"
				class="grid size-8 place-items-center rounded-full text-stone-400 transition hover:bg-stone-200/70 active:scale-95 dark:hover:bg-white/10"
			>
				<ChevronRight size={18} />
			</button>
		</div>
	</div>

	<div
		bind:this={strip}
		class="mt-3 flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		role="group"
		aria-label="Napi aktivitás, görgethető"
	>
		{#each week as d, i (d.day)}
			{@const isToday = i === n - 1}
			{@const isSel = i === idx}
			{@const h = d.xp > 0 ? Math.max(22, Math.round((d.xp / maxXp) * 100)) : 0}
			{@const isBest = best !== null && d.day === best.day && d.xp > 0}
			<button
				onclick={() => (sel = i)}
				aria-label="{fullDate(d.day)}: {d.xp} XP, {d.reviews} ismétlés"
				aria-current={isToday ? 'date' : undefined}
				class={['flex w-11 shrink-0 snap-start flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition active:scale-95', isSel ? 'bg-white shadow-sm dark:bg-white/10' : 'hover:bg-white/60 dark:hover:bg-white/5']}
			>
				<span class="text-[10px] font-extrabold {isToday ? 'text-brand-600 dark:text-white' : 'text-stone-400'}">
					{isToday ? 'MA' : dayLetter(d.day)}
				</span>
				<span class="flex h-14 w-full items-end overflow-hidden rounded-full bg-stone-300/50 dark:bg-white/10">
					{#if h > 0}
						<span
							class="w-full rounded-full {isToday ? 'bg-brand-500' : isBest ? 'bg-amber-400' : 'bg-stone-400 dark:bg-stone-500'}"
							style="height: {h}%"
						></span>
					{:else}
						<span class="mx-auto mb-1 size-1 rounded-full bg-stone-400/60 dark:bg-white/20"></span>
					{/if}
				</span>
				<span class="text-[11px] font-bold text-stone-500 tabular-nums dark:text-stone-400">{dayNum(d.day)}</span>
			</button>
		{/each}
	</div>

	{#if cur}
		<div class="mt-2 flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 dark:bg-white/5">
			<p class="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-900 capitalize dark:text-white">
				{fullDate(cur.day)}
			</p>
			<p class="shrink-0 text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-300">
				{cur.xp} XP · {cur.reviews} ismétlés
			</p>
			{#if idx !== n - 1}
				<button
					onclick={() => {
						sel = -1;
						scrollToday();
					}}
					class="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-[12px] font-bold text-ink-600 transition hover:bg-stone-200 active:scale-95 dark:bg-white/10 dark:text-white"
				>
					Ma
				</button>
			{/if}
		</div>
	{/if}
</section>

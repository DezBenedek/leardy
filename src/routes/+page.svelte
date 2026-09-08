<script lang="ts">
	import { onMount } from 'svelte';
	import { CalendarDays, Check, Layers, Play, Settings } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import { get as cacheGet, peek } from '$lib/cache';
	import { studyApi, type AssignmentRow, type Stats } from '$lib/study';

	let user = $derived(auth.user);
	let stats = $state<Stats | null>(null);
	let assigns = $state<AssignmentRow[]>([]);
	let err = $state<string | null>(null);

	/** A nap betűjele a valódi dátumból (az oszlopok az elmúlt 7 napot mutatják, nem hétfőtől). */
	function dayLetter(day: string): string {
		try {
			return new Date(day + 'T12:00:00').toLocaleDateString('hu-HU', { weekday: 'short' });
		} catch {
			return '';
		}
	}

	async function load() {
		if (!auth.user) return;
		try {
			const [s, a] = await Promise.all([
				cacheGet('stats', () => studyApi.stats(), 30000),
				cacheGet('assignments', () => studyApi.assignments(), 30000)
			]);
			stats = s.data;
			assigns = a.data.assignments;
		} catch (e) {
			if (!stats) err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	onMount(() => {
		stats = peek<Stats>('stats') ?? null;
		assigns = peek<{ assignments: AssignmentRow[] }>('assignments')?.assignments ?? [];
		void load();
	});

	$effect(() => {
		void auth.user;
		void load();
	});

	let maxXp = $derived(Math.max(1, ...((stats?.week ?? []).map((d) => d.xp)), 1));
	let lastDay = $derived(stats?.week?.length ? stats.week[stats.week.length - 1] : undefined);
	let todayReviews = $derived(lastDay?.reviews ?? 0);
	let upcoming = $derived(
		assigns
			.filter((a) => a.due_date > 0)
			.sort((x, y) => x.due_date - y.due_date)
			.slice(0, 3)
	);

	function fmtDue(ts: number): string {
		return new Date(ts).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}
</script>

<svelte:head>
	<title>Leardy — Főoldal</title>
	<meta name="description" content="Leardy főoldal: haladás és folytatás egy helyen." />
</svelte:head>

<div class="flex items-center justify-between gap-3 px-1">
	<div>
		<p class="text-[13px] font-medium text-stone-500 capitalize dark:text-stone-400">
			{new Date().toLocaleDateString('hu-HU', { weekday: 'long', month: 'long', day: 'numeric' })}
		</p>
		<h1 class="font-display mt-0.5 text-[28px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
			{#if user}
				Szia, {user.name.split(' ')[0]}!
			{:else}
				Szia!
			{/if}
		</h1>
	</div>
	<a
		href="/beallitasok"
		aria-label="Beállítások"
		class="grid size-11 place-items-center rounded-full text-ink-600 transition hover:bg-stone-100 active:bg-stone-200 dark:text-stone-300 dark:hover:bg-white/10 dark:active:bg-white/15"
	>
		<Settings size={23} />
	</a>
</div>

{#if !user}
	<section class="mt-3 rounded-[28px] bg-brand-600 p-6 text-white shadow-lg shadow-brand-600/25 dark:bg-brand-500 dark:shadow-black/30">
		<p class="font-display text-[26px] leading-tight font-extrabold tracking-tight">
			Tanulj témakörökben, mérhetően.
		</p>
		<p class="mt-2 text-[15px] text-white/75">
			Leckék, szókártyák és dolgozatok egy helyen — a haladásod megmarad.
		</p>
		<div class="mt-5 grid grid-cols-2 gap-2.5">
			<button
				onclick={() => authUI.show('register')}
				class="rounded-full bg-white px-4 py-3 text-[15px] font-bold text-brand-700 transition hover:bg-brand-50 active:scale-[0.99]"
			>
				Regisztráció
			</button>
			<button
				onclick={() => authUI.show('login')}
				class="rounded-full bg-white/20 px-4 py-3 text-[15px] font-bold text-white transition hover:bg-white/30 active:scale-[0.99]"
			>
				Bejelentkezés
			</button>
		</div>
	</section>
{:else}
	{#if err && !stats}
		<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
	{/if}

	<!-- Mérőszámok -->
	<div class="mt-3 grid grid-cols-2 gap-2.5">
		<div class="rounded-[20px] bg-stone-100 p-4 dark:bg-white/5">
			<p class="font-display text-[26px] leading-none font-extrabold text-ink-900 dark:text-white">{stats?.xp ?? '–'}</p>
			<p class="mt-1 text-[13px] font-medium text-stone-500 dark:text-stone-400">Összes XP</p>
		</div>
		<div class="rounded-[20px] bg-stone-100 p-4 dark:bg-white/5">
			<p class="font-display text-[26px] leading-none font-extrabold text-ink-900 dark:text-white">{stats?.lessonsDone ?? '–'}</p>
			<p class="mt-1 text-[13px] font-medium text-stone-500 dark:text-stone-400">Befejezett lecke</p>
		</div>
		<div class="rounded-[20px] bg-stone-100 p-4 dark:bg-white/5">
			<p class="font-display text-[26px] leading-none font-extrabold text-ink-900 dark:text-white">{stats?.due.mind ?? '–'}</p>
			<p class="mt-1 text-[13px] font-medium text-stone-500 dark:text-stone-400">Mai kártya</p>
		</div>
		<div class="rounded-[20px] bg-stone-100 p-4 dark:bg-white/5">
			<p class="font-display text-[26px] leading-none font-extrabold text-ink-900 dark:text-white">{todayReviews}</p>
			<p class="mt-1 text-[13px] font-medium text-stone-500 dark:text-stone-400">Mai ismétlés</p>
		</div>
	</div>

	<!-- Folytatás -->
	{#if stats?.lastLesson}
		<a
			href="/lecke/{stats.lastLesson.id}"
			class="mt-2.5 flex items-center gap-3.5 rounded-[20px] border border-stone-200 bg-white p-4 transition hover:bg-stone-50 active:scale-[0.995] dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
		>
			<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-white">
				<Play size={20} fill="currentColor" />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Folytatás</span>
				<span class="block truncate text-[16px] font-bold text-ink-900 dark:text-white">
					{stats.lastLesson.title} · {stats.lastLesson.topic_title}
				</span>
			</span>
		</a>
	{/if}

	<!-- Heti aktivitás -->
	<section class="mt-2.5 rounded-[20px] bg-stone-100 p-4 dark:bg-white/5" aria-label="Heti aktivitás">
		<div class="grid grid-cols-7 items-end gap-2">
			{#each (stats?.week ?? []) as d, i (d.day)}
				{@const isToday = stats !== null && i === stats.week.length - 1}
				<div class="flex flex-col items-center gap-1">
					<div class="flex h-10 w-full items-end rounded-full bg-stone-300/50 dark:bg-white/10">
						<div
							class="w-full rounded-full {isToday ? 'bg-brand-500' : 'bg-stone-400 dark:bg-stone-500'}"
							style="height: {d.xp > 0 ? Math.max(20, Math.round((d.xp / maxXp) * 100)) : 10}%"
							title="{d.day}: {d.xp} XP"
						></div>
					</div>
					<span class="text-[11px] font-extrabold text-stone-400">{dayLetter(d.day)}</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- Közelgő határidők -->
	{#if upcoming.length > 0}
		<section class="mt-2.5 rounded-[20px] border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900" aria-label="Határidők">
			<h2 class="flex items-center gap-1.5 text-[15px] font-bold text-ink-900 dark:text-white">
				<CalendarDays size={16} class="text-stone-400" /> Határidők
			</h2>
			<ul class="mt-2 space-y-1.5">
				{#each upcoming as a (a.id)}
					<li>
						<a href="/tanterem/dolgozat/{a.id}" class="flex items-center justify-between gap-2 text-sm">
							<span class="truncate font-medium text-ink-900 dark:text-white">{a.title}</span>
							<span class="shrink-0 text-[13px] font-semibold text-stone-500 dark:text-stone-400">{fmtDue(a.due_date)}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="mt-3" aria-label="Napi gyakorlás">
		<a
			href="/gyakorlas"
			class="flex h-14 items-center justify-center gap-2.5 rounded-full bg-brand-500 text-base font-bold text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-600 active:scale-[0.99]"
		>
			<Layers size={20} />
			Gyakorlás
			{#if (stats?.due.mind ?? 0) > 0}
				<span class="rounded-full bg-white/25 px-2.5 py-0.5 text-sm font-extrabold">{stats?.due.mind}</span>
			{/if}
		</a>
		{#if stats}
			<p class="mt-2 flex items-center justify-center gap-1.5 text-center text-[13px] font-medium text-stone-500 dark:text-stone-400">
				<Check size={14} strokeWidth={3} class="text-emerald-500" />
				{stats.due.language} nyelvi · {stats.due.general} tantárgyi kártya vár
			</p>
		{/if}
	</section>
{/if}

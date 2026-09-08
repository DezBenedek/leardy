<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, Flame, Play, Settings } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import { studyApi, type Stats } from '$lib/study';

	let user = $derived(auth.user);
	let stats = $state<Stats | null>(null);
	let loading = $state(false);
	let err = $state<string | null>(null);

	const weekDays = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];

	onMount(async () => {
		if (!auth.user) return;
		loading = true;
		try {
			stats = await studyApi.stats();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loading = false;
		}
	});

	let maxXp = $derived(Math.max(1, ...((stats?.week ?? []).map((d) => d.xp))));
	let todayCount = $derived(stats?.week[6]?.reviews ?? 0);
</script>

<svelte:head>
	<title>Leardy — Főoldal</title>
	<meta name="description" content="Leardy főoldal: széria, haladás és folytatás egy helyen." />
</svelte:head>

<header class="flex items-center justify-between gap-3 px-1">
	<div>
		<p class="text-[13px] font-medium text-stone-500 capitalize dark:text-stone-400">
			{new Date().toLocaleDateString('hu-HU', { weekday: 'long', month: 'long', day: 'numeric' })}
		</p>
		<h1 class="font-display mt-0.5 text-[32px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
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
</header>

{#if !user}
	<section class="mt-4 rounded-[28px] bg-brand-600 p-6 text-white shadow-lg shadow-brand-600/25 dark:bg-brand-500 dark:shadow-black/30">
		<p class="text-xs font-bold tracking-[0.12em] text-white/70 uppercase">Leardy</p>
		<p class="font-display mt-2 text-[28px] leading-tight font-extrabold tracking-tight">
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
	<section class="mt-4 grid grid-cols-2 gap-3">
		<a href="/temakorok" class="rounded-[24px] bg-stone-100 p-5 dark:bg-white/5">
			<p class="font-display text-[18px] font-bold text-ink-900 dark:text-white">Témakörök</p>
			<p class="mt-1 text-[13px] text-stone-500 dark:text-stone-400">Nyelvek, reál, humán — böngéssz szabadon.</p>
		</a>
		<a href="/gyakorlas" class="rounded-[24px] bg-stone-100 p-5 dark:bg-white/5">
			<p class="font-display text-[18px] font-bold text-ink-900 dark:text-white">Gyakorlás</p>
			<p class="mt-1 text-[13px] text-stone-500 dark:text-stone-400">Napi ismétlések bejelentkezés után.</p>
		</a>
	</section>
{:else if loading && !stats}
	<section class="mt-4 rounded-[24px] bg-stone-100 p-6 dark:bg-white/5">
		<p class="text-[15px] text-stone-500 dark:text-stone-400">Statisztika betöltése…</p>
	</section>
{:else if err && !stats}
	<section class="mt-4 rounded-[24px] bg-red-50 p-6 dark:bg-red-500/10">
		<p class="text-[15px] font-medium text-red-700 dark:text-red-300">{err}</p>
	</section>
{:else if stats}
	<!-- Széria + hőtérkép -->
	<section class="mt-4 rounded-[28px] bg-brand-600 p-6 text-white shadow-lg shadow-brand-600/25 dark:bg-brand-500 dark:shadow-black/30" aria-label="Széria">
		<p class="flex items-center gap-1.5 text-xs font-bold tracking-[0.12em] text-white/70 uppercase">
			<Flame size={15} fill="currentColor" class="text-amber-300" />
			Széria
		</p>
		<p class="font-display mt-2 text-[56px] leading-none font-extrabold tracking-tight">
			{stats.streak} <span class="text-[24px] font-bold text-white/70">nap</span>
		</p>
		<p class="mt-2 text-[15px] text-white/75">Ma {todayCount} ismétlés — {stats.xp} XP összesen.</p>
		<div class="mt-5 grid grid-cols-7 items-end gap-2" aria-label="Heti aktivitás">
			{#each stats.week as d, i (d.day)}
				<div class="flex flex-col items-center gap-1.5">
					<div class="flex h-12 w-full items-end rounded-full bg-white/20">
						<div
							class="w-full rounded-full {i === 6 ? 'bg-amber-300' : 'bg-white'}"
							style="height: {d.xp > 0 ? Math.max(18, Math.round((d.xp / maxXp) * 100)) : 8}%"
							title="{d.day}: {d.xp} XP"
						></div>
					</div>
					<span class="text-[11px] font-extrabold text-white/70">{weekDays[i]}</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- Folytatás -->
	<section class="mt-4" aria-label="Folytatás">
		{#if stats.lastLesson}
			<a
				href="/lecke/{stats.lastLesson.id}"
				class="flex items-center gap-3.5 rounded-[24px] border border-stone-200 bg-white p-5 transition hover:bg-stone-50 dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
			>
				<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white">
					<Play size={22} fill="currentColor" />
				</span>
				<span class="min-w-0 flex-1">
					<span class="block text-[13px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Folytatás</span>
					<span class="block truncate text-[16px] font-bold text-ink-900 dark:text-white">
						{stats.lastLesson.title} · {stats.lastLesson.topic_title}
					</span>
				</span>
			</a>
		{:else}
			<a
				href="/temakorok"
				class="flex items-center gap-3.5 rounded-[24px] border border-stone-200 bg-white p-5 transition hover:bg-stone-50 dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
			>
				<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white">
					<Play size={22} fill="currentColor" />
				</span>
				<span class="min-w-0 flex-1">
					<span class="block text-[13px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Kezdés</span>
					<span class="block truncate text-[16px] font-bold text-ink-900 dark:text-white">Válassz témakört a könyvtárból</span>
				</span>
			</a>
		{/if}
	</section>

	<!-- Mai állapot -->
	<section class="mt-4 rounded-[24px] bg-stone-100 p-6 dark:bg-white/5" aria-label="Mai állapot">
		<h2 class="font-display text-[22px] font-bold tracking-tight text-ink-900 dark:text-white">Ma</h2>
		<ul class="mt-4 space-y-3">
			<li>
				<a href="/gyakorlas" class="flex items-center justify-between gap-3">
					<p class="text-[15px] font-medium text-ink-900 dark:text-white">Ismétlésre váró kártya</p>
					<p class="font-display text-[20px] font-extrabold text-ink-900 dark:text-white">{stats.due.mind}</p>
				</a>
			</li>
			<li>
				<a href="/tanterem" class="flex items-center justify-between gap-3">
					<p class="text-[15px] font-medium text-ink-900 dark:text-white">Befejezett lecke</p>
					<p class="font-display text-[20px] font-extrabold text-ink-900 dark:text-white">{stats.lessonsDone}</p>
				</a>
			</li>
			<li class="flex items-center gap-2 pt-1 text-[14px] font-medium text-emerald-600 dark:text-emerald-400">
				<Check size={16} strokeWidth={3} /> Minden adat az adatbázisban, eszközök között is megmarad.
			</li>
		</ul>
	</section>

	<section class="mt-7" aria-label="Napi gyakorlás">
		<a
			href="/gyakorlas"
			class="flex h-14 items-center justify-center gap-2.5 rounded-full bg-brand-500 text-base font-bold text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-600 hover:shadow-xl hover:shadow-brand-500/30 active:scale-[0.99]"
		>
			<Play size={20} fill="currentColor" />
			Napi gyakorlás
		</a>
		<p class="mt-2.5 text-center text-[13px] font-medium text-stone-500 dark:text-stone-400">
			{stats.due.mind} kártya vár · {stats.due.language} nyelvi · {stats.due.general} tantárgyi
		</p>
	</section>
{/if}

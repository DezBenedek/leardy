<script lang="ts">
	import { ChevronRight, Download, SlidersHorizontal } from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import SearchInput from '$lib/ui/SearchInput.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface Overview {
		students: number;
		teachers: number;
		activeStudents: number;
		lessonsDone: number;
		avgScore: number | null;
		submissionRate: number | null;
		streakAvg: number;
		topTopics: { title: string; done: number }[];
		weakTopics: { title: string; done: number }[];
	}

	interface Student {
		id: string; name: string; email: string; xp: number; streak: number;
		lessonsDone: number; lastActive: number | null; suspended: boolean; muted: boolean; classes: number;
	}

	let range = $state(30);
	let tab = $state<'student' | 'teacher'>('student');
	let overview = $state<Overview | null>(null);
	let students = $state<Student[]>([]);
	let total = $state(0);
	let moreBusy = $state(false);
	let classrooms = $state<{ id: string; name: string; teacher: string; members: number; tasks: number; recent_subs: number }[]>([]);
	let classTotal = $state(0);
	let classBusy = $state(false);
	let q = $state('');
	let cq = $state('');
	let classesOpen = $state(false);
	let filterOpen = $state(false);
	let searchFocus = $state(false);
	let loading = $state(true);
	let error = $state('');
	const PAGE = 30;

	async function load() {
		if (data.forbidden) {
			loading = false;
			return;
		}
		loading = true;
		error = '';
		try {
			const [o, s, c] = await Promise.all([
				fetch(`/api/admin/overview?range=${range}`, { credentials: 'same-origin' }),
				fetch(`/api/admin/students?role=${tab}&q=${encodeURIComponent(q)}&limit=${PAGE}&offset=0`, { credentials: 'same-origin' }),
				tab === 'student' ? fetch(`/api/admin/school-classrooms?q=${encodeURIComponent(cq)}&limit=${PAGE}&offset=0`, { credentials: 'same-origin' }) : Promise.resolve(null)
			]);
			if (!o.ok) throw new Error((await o.json().catch(() => ({}))).error ?? 'Statisztika nem tölthető.');
			if (!s.ok) throw new Error((await s.json().catch(() => ({}))).error ?? 'Diáklista nem tölthető.');
			overview = await o.json();
			const sj = await s.json();
			students = sj.items ?? [];
			total = sj.total ?? 0;
			if (c && c.ok) {
				const cj = await c.json();
				classrooms = cj.items ?? [];
				classTotal = cj.total ?? 0;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loading = false;
		}
	}

	async function loadMorePeople() {
		if (moreBusy || students.length >= total) return;
		moreBusy = true;
		try {
			const res = await fetch(`/api/admin/students?role=${tab}&q=${encodeURIComponent(q)}&limit=${PAGE}&offset=${students.length}`, { credentials: 'same-origin' });
			if (res.ok) {
				const j = await res.json();
				students = [...students, ...(j.items ?? [])];
				total = j.total ?? total;
			}
		} finally {
			moreBusy = false;
		}
	}

	async function loadMoreClasses() {
		if (classBusy || classrooms.length >= classTotal) return;
		classBusy = true;
		try {
			const res = await fetch(`/api/admin/school-classrooms?q=${encodeURIComponent(cq)}&limit=${PAGE}&offset=${classrooms.length}`, { credentials: 'same-origin' });
			if (res.ok) {
				const j = await res.json();
				classrooms = [...classrooms, ...(j.items ?? [])];
				classTotal = j.total ?? classTotal;
			}
		} finally {
			classBusy = false;
		}
	}

	async function loadPeople() {
		try {
			const res = await fetch(`/api/admin/students?role=${tab}&q=${encodeURIComponent(q)}&limit=${PAGE}&offset=0`, { credentials: 'same-origin' });
			if (res.ok) {
				const j = await res.json();
				students = j.items ?? [];
				total = j.total ?? 0;
			}
		} catch {
			// néma hiba
		}
	}

	let timer: ReturnType<typeof setTimeout>;
	let classTimer: ReturnType<typeof setTimeout>;
	let firstPeopleRun = true;
	let skipPeopleOnce = false;
	$effect(() => {
		void range;
		void tab;
		void load();
	});
	$effect(() => {
		void q;
		if (firstPeopleRun) {
			firstPeopleRun = false;
			return;
		}
		if (skipPeopleOnce) {
			skipPeopleOnce = false;
			return;
		}
		clearTimeout(timer);
		timer = setTimeout(() => void loadPeople(), 350);
		return () => clearTimeout(timer);
	});
	async function onClassSearch(v: string) {
		cq = v;
		clearTimeout(classTimer);
		classTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/admin/school-classrooms?q=${encodeURIComponent(cq)}&limit=${PAGE}&offset=0`, { credentials: 'same-origin' });
				if (res.ok) {
					const j = await res.json();
					classrooms = j.items ?? [];
					classTotal = j.total ?? 0;
				}
			} catch {
				// néma hiba
			}
		}, 350);
	}
	function switchTab(t: 'student' | 'teacher') {
		if (tab === t) return;
		tab = t;
		skipPeopleOnce = true;
		q = '';
	}

	function resetFilters() {
		range = 30;
		if (tab !== 'student') {
			skipPeopleOnce = true;
			tab = 'student';
			q = '';
		}
	}

	let activeFilterCount = $derived((range !== 30 ? 1 : 0) + (tab !== 'student' ? 1 : 0));

	function fmtDate(t: number | null): string {
		if (!t) return 'még nincs adat';
		return new Date(t).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
	}

	async function exportCsv() {
		if (!overview) return;
		const isTeacher = tab === 'teacher';
		let rows: Student[] = [];
		try {
			const res = await fetch(`/api/admin/students?role=${tab}&q=${encodeURIComponent(q)}&limit=5000&offset=0`, { credentials: 'same-origin' });
			if (!res.ok) return;
			rows = ((await res.json()).items ?? []) as Student[];
		} catch {
			return;
		}
		if (rows.length === 0) return;
		const head = isTeacher ? 'Név;E-mail;XP;Sorozat;Osztályok;Utolsó aktivitás;Állapot' : 'Név;E-mail;XP;Sorozat;Lecke kész;Utolsó aktivitás;Állapot';
		const lines = rows.map((s) =>
			[s.name, s.email, String(s.xp), String(s.streak), String(isTeacher ? s.classes : s.lessonsDone),
				s.lastActive ? new Date(s.lastActive).toLocaleDateString('hu-HU') : '',
				s.suspended ? 'tiltva' : s.muted ? 'némítva' : 'aktív']
				.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')
		);
		const blob = new Blob([`﻿${head}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `iskola-statisztika-${range}-nap.csv`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 5000);
	}
</script>

<svelte:head>
	<title>Iskola statisztika | Leardy</title>
</svelte:head>

{#if data.forbidden}
	<div class="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
		<p class="font-bold text-ink-900 dark:text-white">Nincs jogosultságod</p>
	</div>
{:else}
<div class="flex items-center {searchFocus ? 'gap-0' : 'gap-2'}">
	<div
		class="shrink-0 overflow-hidden transition-all duration-200 motion-reduce:transition-none"
		style:max-width={searchFocus ? '0px' : '220px'}
		style:opacity={searchFocus ? '0' : '1'}
	>
		<h1 class="font-display truncate text-[22px] font-extrabold tracking-tight whitespace-nowrap text-ink-900 dark:text-white">Iskola</h1>
	</div>
	<SearchInput
		bind:value={q}
		placeholder="Keresés…"
		ariaLabel={tab === 'teacher' ? 'Tanár keresése' : 'Diák keresése'}
		onfocus={() => (searchFocus = true)}
		onblur={() => (searchFocus = false)}
	/>
	<div
		class="relative shrink-0 overflow-hidden transition-[width,opacity] duration-200 motion-reduce:transition-none"
		style:width={searchFocus ? '0px' : '46px'}
		style:opacity={searchFocus ? '0' : '1'}
	>
		<div class="grid h-full w-[46px] place-items-center">
			<IconButton
				ariaLabel="Szűrők"
				size={46}
				disabled={searchFocus}
				onclick={() => (filterOpen = true)}
			>
				<SlidersHorizontal size={22} />
			</IconButton>
		</div>
		{#if activeFilterCount > 0}
			<span
				class="absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-brand-500 text-[10px] font-extrabold text-white"
				aria-hidden="true"
			>
				{activeFilterCount}
			</span>
		{/if}
	</div>
	<div
		class="shrink-0 overflow-hidden transition-[width,opacity] duration-200 motion-reduce:transition-none"
		style:width={searchFocus ? '0px' : '46px'}
		style:opacity={searchFocus ? '0' : '1'}
	>
		<div class="grid h-full w-[46px] place-items-center">
			<IconButton
				ariaLabel="CSV letöltése"
				size={46}
				disabled={searchFocus || students.length === 0}
				onclick={() => void exportCsv()}
			>
				<Download size={22} />
			</IconButton>
		</div>
	</div>
</div>

{#if loading && !overview}
	<div class="mt-3 grid gap-2.5" role="status" aria-label="Betöltés">
		{#each [0, 1, 2, 3] as i (i)}
			<div class="h-20 animate-pulse rounded-2xl bg-stone-100 dark:bg-white/5"></div>
		{/each}
	</div>
{:else if error}
	<p class="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p>
{:else if overview}
	<div class="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
		{#each [
			{ v: String(overview.students), l: 'Diák' },
			{ v: String(overview.activeStudents), l: 'Aktív diák' },
			{ v: String(overview.lessonsDone), l: 'Lecke kész' },
			{ v: overview.avgScore == null ? 'nincs adat' : `${Math.round(overview.avgScore * 100)}%`, l: 'Átlag pont' }
		] as kpi (kpi.l)}
			<div class="rounded-2xl border border-stone-200 bg-white p-3.5 dark:border-white/10 dark:bg-stone-900">
				<p class="text-[20px] font-extrabold text-ink-900 dark:text-white">{kpi.v}</p>
				<p class="text-[12px] font-medium text-stone-500">{kpi.l}</p>
			</div>
		{/each}
	</div>
	{#if overview.topTopics.length > 0 || overview.weakTopics.length > 0}
	<div class="mt-2.5 rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<p class="text-[11px] font-extrabold tracking-[0.12em] text-emerald-600 uppercase dark:text-emerald-400">Erős témakörök</p>
				<ul class="mt-1.5 grid gap-1">
					{#each overview.topTopics.slice(0, 5) as t (t.title)}
						<li class="flex items-center justify-between gap-2 text-[13px]">
							<span class="truncate font-medium">{t.title}</span>
							<span class="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[12px] font-bold text-emerald-700 dark:text-emerald-300">{t.done}</span>
						</li>
					{/each}
				</ul>
			</div>
			<div>
				<p class="text-[11px] font-extrabold tracking-[0.12em] text-amber-600 uppercase dark:text-amber-400">Fejlesztendők</p>
				<ul class="mt-1.5 grid gap-1">
					{#each overview.weakTopics.slice(0, 5) as t (t.title)}
						<li class="flex items-center justify-between gap-2 text-[13px]">
							<span class="truncate font-medium">{t.title}</span>
							<span class="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[12px] font-bold text-amber-700 dark:text-amber-300">{t.done}</span>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</div>
	{/if}
	<button
		type="button"
		onclick={() => (classesOpen = true)}
		class="mt-2.5 flex w-full items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3.5 py-3 text-left transition active:scale-[0.99] dark:border-white/10 dark:bg-stone-900"
	>
		<span class="min-w-0 flex-1">
			<span class="block text-[14px] font-extrabold">Osztályok</span>
			<span class="block text-[12px] text-stone-500">{classTotal} osztály</span>
		</span>
		<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
	</button>
{/if}


<p class="mt-2 px-1 text-[12px] font-bold text-stone-400">{tab === 'teacher' ? 'Tanárok' : 'Diákok'}: {students.length} / {total}</p>

<ul class="mt-2 grid gap-2">
	{#each students as s (s.id)}
		<li class="flex items-center gap-2.5 rounded-2xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-stone-900">
			<span class="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500/10 text-[13px] font-extrabold text-brand-600 dark:text-brand-300">
				{s.name.trim().charAt(0).toUpperCase()}
			</span>
			<span class="min-w-0 flex-1">
				<span class="flex items-center gap-1.5">
					<span class="truncate text-[14px] font-bold">{s.name}</span>
					{#if s.suspended}<span class="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-600">Tiltva</span>{/if}
					{#if s.muted}<span class="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-700">Némítva</span>{/if}
				</span>
				<span class="block truncate text-[12px] text-stone-500">
					{tab === 'teacher' ? `${s.classes} osztály` : `${s.lessonsDone} lecke`} · {s.streak} nap sorozat · utoljára {fmtDate(s.lastActive)}
				</span>
			</span>
			<span class="shrink-0 text-[13px] font-extrabold text-stone-400">{s.xp} XP</span>
		</li>
	{/each}
</ul>
{#if students.length < total}
	<button
		type="button"
		onclick={() => void loadMorePeople()}
		disabled={moreBusy}
		class="mt-2 w-full rounded-full border border-stone-200 px-4 py-2.5 text-[13px] font-bold disabled:opacity-50 dark:border-white/10"
	>
		{moreBusy ? 'Betöltés…' : `Továbbiak (${students.length} / ${total})`}
	</button>
{/if}

<Drawer open={filterOpen} label="Szűrők" title="Szűrők" onClose={() => (filterOpen = false)}>
	<p class="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Időszak</p>
	<div role="group" aria-label="Időszak szűrő" class="mt-1 grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-white/10">
		{#each [7, 30, 90] as r (r)}
			{@const selected = range === r}
			<button
				type="button"
				aria-pressed={selected}
				onclick={() => (range = r)}
				class={[
					'rounded-xl px-2 py-2 text-[13px] leading-none transition active:scale-[0.97]',
					selected
						? 'bg-white font-extrabold text-ink-900 shadow-sm dark:bg-stone-800 dark:text-white'
						: 'font-semibold text-stone-500 hover:text-ink-900 dark:text-stone-400 dark:hover:text-white'
				]}
			>
				{r} nap
			</button>
		{/each}
	</div>
	<p class="mt-3 text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Névsor</p>
	<div role="group" aria-label="Névsor szűrő" class="mt-1 grid grid-cols-2 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-white/10">
		{#each [{ id: 'student', label: 'Diákok' }, { id: 'teacher', label: 'Tanárok' }] as t (t.id)}
			{@const selected = tab === t.id}
			<button
				type="button"
				aria-pressed={selected}
				onclick={() => switchTab(t.id as 'student' | 'teacher')}
				class={[
					'rounded-xl px-2 py-2 text-[13px] leading-none transition active:scale-[0.97]',
					selected
						? 'bg-white font-extrabold text-ink-900 shadow-sm dark:bg-stone-800 dark:text-white'
						: 'font-semibold text-stone-500 hover:text-ink-900 dark:text-stone-400 dark:hover:text-white'
				]}
			>
				{t.label}
			</button>
		{/each}
	</div>
	{#if activeFilterCount > 0}
		<button
			type="button"
			onclick={resetFilters}
			class="mt-3 w-full rounded-full border border-stone-200 px-4 py-2.5 text-[13px] font-bold dark:border-white/10"
		>
			Szűrők törlése
		</button>
	{/if}
</Drawer>

<Drawer open={classesOpen} label="Iskola osztályai" title="Osztályok" onClose={() => (classesOpen = false)} wide>
	<input
		type="search"
		placeholder="Keresés osztály vagy tanár alapján"
		value={cq}
		oninput={(e) => onClassSearch((e.target as HTMLInputElement).value)}
		aria-label="Osztály keresése"
		class="w-full rounded-full border border-stone-200 bg-white px-4 py-2.5 text-[14px] outline-none focus:border-brand-500 dark:border-white/10 dark:bg-stone-900"
	/>
	<p class="mt-2 text-[12px] font-bold text-stone-400">{classrooms.length} / {classTotal} osztály</p>
	<ul class="mt-2 grid gap-2 pb-2">
		{#each classrooms as c (c.id)}
			<li class="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-stone-900">
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[14px] font-bold">{c.name}</span>
					<span class="block truncate text-[12px] text-stone-500">{c.teacher} · {c.members} fő · {c.tasks} feladat</span>
				</span>
				<span class="shrink-0 rounded-full bg-brand-500/10 px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-brand-700 dark:text-brand-300">{c.recent_subs} / 30 nap</span>
			</li>
		{/each}
	</ul>
	{#if classrooms.length < classTotal}
		<button
			type="button"
			onclick={() => void loadMoreClasses()}
			disabled={classBusy}
			class="mt-1 w-full rounded-full border border-stone-200 px-4 py-2.5 text-[13px] font-bold disabled:opacity-50 dark:border-white/10"
		>
			{classBusy ? 'Betöltés…' : `Továbbiak (${classrooms.length} / ${classTotal})`}
		</button>
	{/if}
</Drawer>

{/if}

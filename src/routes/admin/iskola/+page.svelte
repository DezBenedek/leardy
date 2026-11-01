<script lang="ts">
	import { ChevronRight } from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
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

	let timer: ReturnType<typeof setTimeout>;
	let classTimer: ReturnType<typeof setTimeout>;
	$effect(() => {
		void range;
		void tab;
		void load();
	});
	function onSearch(v: string) {
		q = v;
		clearTimeout(timer);
		timer = setTimeout(() => void load(), 350);
	}
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
		q = '';
	}

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
		<p class="font-bold text-ink-900 dark:text-white">Nincs jogosultságod ehhez az oldalhoz</p>
		<p class="mt-1 text-sm text-stone-500">Iskola vezetői, admin vagy fejlesztői szerep kell.</p>
	</div>
{:else}
<div class="flex items-center gap-2">
	<p class="text-[11px] font-extrabold tracking-[0.14em] text-stone-400 uppercase dark:text-stone-500">Saját iskola</p>
	<div class="ml-auto flex gap-1 rounded-full bg-stone-100 p-1 dark:bg-white/5">
		{#each [7, 30, 90] as r (r)}
			<button
				type="button"
				onclick={() => (range = r)}
				class={['rounded-full px-3 py-1 text-[12px] font-bold transition', range === r ? 'bg-white text-ink-900 shadow dark:bg-stone-800 dark:text-white' : 'text-stone-500']}
			>
				{r} nap
			</button>
		{/each}
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
			<span class="block text-[12px] text-stone-500">{classTotal} osztály az iskolában</span>
		</span>
		<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
	</button>
{/if}


<div class="mt-4 flex items-center gap-1 rounded-full bg-stone-100 p-1 dark:bg-white/5" role="group" aria-label="Névsor">
	{#each [{ id: 'student', label: 'Diákok' }, { id: 'teacher', label: 'Tanárok' }] as t (t.id)}
		<button
			type="button"
			onclick={() => switchTab(t.id as 'student' | 'teacher')}
			aria-pressed={tab === t.id}
			class={['flex-1 rounded-full px-3 py-1.5 text-[13px] font-bold transition', tab === t.id ? 'bg-white text-ink-900 shadow dark:bg-stone-800 dark:text-white' : 'text-stone-500']}
		>
			{t.label}
		</button>
	{/each}
</div>

<div class="mt-2 flex items-center gap-2">
{#key tab}
	<input
		type="search"
		placeholder={tab === 'teacher' ? 'Keresés tanár neve vagy e-mailje alapján' : 'Keresés név vagy e-mail alapján'}
		value={q}
		oninput={(e) => onSearch((e.target as HTMLInputElement).value)}
		aria-label={tab === 'teacher' ? 'Tanár keresése' : 'Diák keresése'}
		class="min-w-0 flex-1 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-[14px] outline-none focus:border-brand-500 dark:border-white/10 dark:bg-stone-900"
	/>
{/key}
	<span class="shrink-0 text-[12px] font-bold text-stone-400">{students.length} / {total} fő</span>
	<button
		type="button"
		onclick={exportCsv}
		disabled={students.length === 0}
		class="shrink-0 rounded-full border border-stone-200 px-3.5 py-2 text-[12px] font-bold text-stone-600 transition active:scale-95 disabled:opacity-40 dark:border-white/10 dark:text-stone-300"
	>
		CSV letöltés
	</button>
</div>

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

<Drawer open={classesOpen} label="Iskola osztályai" title="Iskola osztályai" onClose={() => (classesOpen = false)} wide>
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

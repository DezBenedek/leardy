<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell, CalendarDays, Plus, UserPlus, Users } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { get as cacheGet, invalidate, peek } from '$lib/cache';
	import { CATEGORIES, studyApi, type AssignmentRow, type Classroom } from '$lib/study';

	let user = $derived(auth.user);
	let isTeacher = $derived((user?.role ?? 'student') === 'teacher');

	let rooms = $state<Classroom[]>([]);
	let assigns = $state<AssignmentRow[]>([]);
	let err = $state<string | null>(null);
	let loadedOnce = $state(false);

	let joinCode = $state('');
	let joinOpen = $state(false);
	let newRoom = $state('');
	let newSubject = $state('Angol');
	let createOpen = $state(false);

	// Tanári kiadó a Kvízek oldalon van; itt csak az osztály-létrehozás állapota kell.

	async function load() {
		if (!auth.user) return;
		err = null;
		try {
			const [r, a] = await Promise.all([
				cacheGet('classrooms', () => studyApi.classrooms(), 30000),
				cacheGet('assignments', () => studyApi.assignments(), 30000)
			]);
			rooms = r.data.classrooms;
			assigns = a.data.assignments;
		} catch (e) {
			if (!loadedOnce) err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loadedOnce = true;
		}
	}

	onMount(() => {
		rooms = peek<{ classrooms: Classroom[] }>('classrooms')?.classrooms ?? [];
		assigns = peek<{ assignments: AssignmentRow[] }>('assignments')?.assignments ?? [];
		if (rooms.length > 0 || assigns.length > 0) loadedOnce = true;
		void load();
	});

	$effect(() => {
		void auth.user;
		void load();
	});

	function fmtDue(ts: number): string {
		if (!ts) return 'nincs határidő';
		return new Date(ts).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	async function join() {
		if (!joinCode.trim()) return;
		try {
			await studyApi.joinClassroom(joinCode.trim());
			joinCode = '';
			joinOpen = false;
			invalidate('classrooms');
			invalidate('assignments');
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function createRoom() {
		if (!newRoom.trim() || !newSubject) return;
		try {
			await studyApi.createClassroom(newRoom.trim(), newSubject);
			newRoom = '';
			createOpen = false;
			invalidate('classrooms');
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}
</script>

<svelte:head>
	<title>Tanterem — Leardy</title>
</svelte:head>

{#if !user}
	<section class="mt-3 rounded-[24px] border border-stone-200 bg-white p-8 text-center dark:border-white/10 dark:bg-stone-900" aria-label="Bejelentkezés szükséges">
		<span class="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white">
			<Users size={26} />
		</span>
		<h1 class="font-display mt-4 text-[22px] font-bold tracking-tight text-ink-900 dark:text-white">A tanterem fiókhoz kötött</h1>
		<p class="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-stone-500 dark:text-stone-400">
			Jelentkezz be, hogy lásd az osztályaid, házijaid és dolgozataid.
		</p>
		<button
			onclick={() => authUI.show('login')}
			class="mt-5 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99]"
		>
			Bejelentkezés
		</button>
		<button
			onclick={() => authUI.show('register')}
			class="mt-2 w-full rounded-full border border-stone-200 bg-white py-3 text-[15px] font-bold text-ink-900 transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
		>
			Regisztráció
		</button>
	</section>
{:else}
	<div class="mt-3 flex items-center gap-2">
		<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Tanterem</h1>
		{#if isTeacher}
			<button
				onclick={() => {
					err = null;
					createOpen = true;
				}}
				aria-label="Új osztály"
				class="grid size-10 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 active:scale-95"
			>
				<Plus size={20} strokeWidth={2.5} />
			</button>
		{/if}
	</div>
	{#if err}
		<p role="alert" class="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
	{/if}

	<!-- 1. Teendők -->
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-stone-900" aria-label="Teendők">
		<h2 class="flex items-center gap-2 text-[16px] font-bold text-ink-900 dark:text-white">
			<CalendarDays size={18} class="text-ink-400 dark:text-stone-500" /> Teendők
		</h2>
		{#if assigns.length === 0}
			<p class="mt-2 text-sm text-stone-500 dark:text-stone-400">Nincs kiadott feladat. Ha csatlakozol egy csoporthoz, itt látod a házikat.</p>
		{:else}
			<ul class="mt-3 space-y-2.5">
				{#each assigns as a, i (a.id)}
					<li style="--d:{Math.min(i * 45, 270)}ms" class="anim-rise flex items-center gap-3.5 rounded-xl border border-stone-100 p-3.5 dark:border-white/10">
						<span class="grid size-10 shrink-0 place-items-center rounded-lg {a.is_exam ? 'bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-300' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-white'}">
							<Bell size={19} />
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-[15px] font-semibold text-ink-900 dark:text-white">
								{a.title}
								{#if a.is_exam}<span class="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-400/10 dark:text-red-300">DOLGOZAT</span>{/if}
							</p>
							<p class="text-[13px] text-ink-400 dark:text-stone-500">
								{a.classroom_name} · határidő: {fmtDue(a.due_date)}
								{#if a.best !== null} · legjobb: {a.best}{/if}
							</p>
						</div>
						{#if a.submitted && a.max_attempts > 0 && a.attempts >= a.max_attempts}
							<span class="shrink-0 rounded-full bg-stone-100 px-3 py-1.5 text-[13px] font-semibold text-stone-500 dark:bg-white/10 dark:text-stone-400">Beadva</span>
						{:else}
							<a
								href="/tanterem/dolgozat/{a.id}"
								class="shrink-0 rounded-full bg-brand-500 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-brand-600"
							>
								{a.submitted ? 'Újra' : 'Kitöltés'}
							</a>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- 2. Osztálylista -->
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-stone-900" aria-label="Osztályok">
		<h2 class="text-[16px] font-bold text-ink-900 dark:text-white">Osztályaim</h2>
		<ul class="mt-3 space-y-2">
			{#each rooms as r, i (r.id)}
				<li style="--d:{Math.min(i * 45, 270)}ms" class="anim-rise">
					<a
						href="/tanterem/{r.id}"
						class="flex items-center gap-3 rounded-xl bg-stone-100 px-3.5 py-2.5 transition hover:bg-stone-200/70 dark:bg-white/5 dark:hover:bg-white/10"
					>
						<span class="flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">{r.name}</span>
						{#if r.subject}
							<span class="shrink-0 rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-bold text-stone-600 dark:bg-white/10 dark:text-stone-300">{r.subject}</span>
						{/if}
						<span class="text-xs font-bold text-stone-400 dark:text-stone-500">{r.members ?? 0} fő</span>
					</a>
				</li>
			{:else}
				<p class="text-sm text-stone-500 dark:text-stone-400">Még nem vagy egy osztályban sem — csatlakozz lejjebb kóddal!</p>
			{/each}
		</ul>
	</section>

	<!-- 3. Csatlakozás új csoporthoz (gomb → drawer) -->
	<section class="mt-3" aria-label="Csatlakozás új csoporthoz">
		<button
			onclick={() => {
				err = null;
				joinOpen = true;
			}}
			class="flex w-full items-center justify-center gap-2 rounded-full border-2 border-dashed border-stone-300 py-3.5 text-[15px] font-bold text-stone-500 transition hover:border-brand-500 hover:text-brand-600 active:scale-[0.99] dark:border-white/15 dark:text-stone-400 dark:hover:border-brand-400 dark:hover:text-white"
		>
			<UserPlus size={19} />
			Csatlakozás új csoporthoz
		</button>
	</section>

	<Drawer open={joinOpen} label="Csatlakozás" onClose={() => (joinOpen = false)}>
		<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
			<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">
				Csatlakozás új csoporthoz
			</h2>
			<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Kérd el a tanárodtól az osztály kódját.</p>
			{#if err}
				<p role="alert" class="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
			{/if}
			<form
				onsubmit={(e) => {
					e.preventDefault();
					join();
				}}
				class="mt-4 space-y-2.5"
			>
				<input
					bind:value={joinCode}
					placeholder="Osztálykód (pl. X7K2QA)"
					autocomplete="off"
					aria-label="Osztálykód"
					class="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-center text-lg font-extrabold tracking-[0.2em] uppercase text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
				/>
				<button
					type="submit"
					class="w-full rounded-full bg-ink-900 py-3 text-[15px] font-bold text-white transition hover:opacity-90 active:scale-[0.99] dark:bg-white dark:text-ink-900"
				>
					Csatlakozás
				</button>
			</form>
		</div>
	</Drawer>

	<Drawer open={createOpen} label="Új osztály" onClose={() => (createOpen = false)}>
		<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
			<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Új osztály</h2>
			<label class="mt-4 block text-[13px] font-semibold text-ink-900 dark:text-white" for="new-room-name">Név</label>
			<input
				id="new-room-name"
				bind:value={newRoom}
				placeholder="Pl. 7.B Angol"
				class="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
			/>
			<p class="mt-4 text-[13px] font-semibold text-ink-900 dark:text-white">Tantárgy</p>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each CATEGORIES as c (c)}
					<button
						onclick={() => (newSubject = c)}
						aria-pressed={newSubject === c}
						class={['rounded-full px-4 py-2 text-sm font-semibold transition', newSubject === c ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
					>
						{c}
					</button>
				{/each}
			</div>
			<button
				onclick={() => void createRoom()}
				disabled={!newRoom.trim()}
				class="mt-4 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
			>
				Létrehozás
			</button>
		</div>
	</Drawer>
{/if}

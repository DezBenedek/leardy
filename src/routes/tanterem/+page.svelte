<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell, CalendarDays, Plus, Trophy, Users } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import { studyApi, type AssignmentRow, type Classroom, type Topic } from '$lib/study';

	let user = $derived(auth.user);
	let isTeacher = $derived((user?.role ?? 'student') === 'teacher');

	let rooms = $state<Classroom[]>([]);
	let assigns = $state<AssignmentRow[]>([]);
	let topics = $state<Topic[]>([]);
	let loading = $state(true);
	let err = $state<string | null>(null);

	// Csatlakozás / létrehozás
	let joinCode = $state('');
	let newRoom = $state('');

	// Tanári dolgozat-kiadó (egy űrlap: generálás + kiadás egyben)
	let aTopic = $state('');
	let aTitle = $state('');
	let aClass = $state('');
	let aDue = $state('');
	let aCount = $state(10);
	let aAttempts = $state(1);
	let aTime = $state(15);
	let aShuffle = $state(true);
	let aDelayed = $state(false);
	let aExam = $state(true);
	let aBusy = $state(false);
	let aMsg = $state<string | null>(null);

	async function load() {
		if (!auth.user) {
			loading = false;
			return;
		}
		loading = true;
		err = null;
		try {
			const [r, a] = await Promise.all([studyApi.classrooms(), studyApi.assignments()]);
			rooms = r.classrooms;
			assigns = a.assignments;
			if ((auth.user?.role ?? 'student') === 'teacher') {
				topics = (await studyApi.topics('')).topics;
				if (!aTopic && topics.length > 0) aTopic = topics[0].id;
				if (!aClass && rooms.length > 0) aClass = rooms[0].id;
			}
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loading = false;
		}
	}

	onMount(load);
	$effect(() => {
		void auth.user;
		load();
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
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function createRoom() {
		if (!newRoom.trim()) return;
		try {
			await studyApi.createClassroom(newRoom.trim());
			newRoom = '';
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function publish() {
		if (!aTopic || !aClass || !aTitle.trim()) {
			aMsg = 'Témakör, cím és osztály is kell.';
			return;
		}
		aBusy = true;
		aMsg = null;
		try {
			const built = await studyApi.buildAssessment({
				topic_id: aTopic,
				title: aTitle.trim(),
				max_attempts: aAttempts,
				time_limit_mins: aTime,
				shuffle: aShuffle,
				feedback_delayed: aDelayed,
				is_exam: aExam,
				count: aCount
			});
			const due = aDue ? new Date(aDue).getTime() : 0;
			await studyApi.assign({ assessment_id: built.assessment.id, classroom_id: aClass, due_date: due });
			aMsg = 'Kiadva! A diákok a listában látják.';
			aTitle = '';
			await load();
		} catch (e) {
			aMsg = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			aBusy = false;
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
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<div class="flex items-center gap-3.5">
			<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
				<Users size={22} />
			</span>
			<div>
				<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Tanterem</h1>
				<p class="text-sm text-ink-600 dark:text-stone-400">Házik, határidők, éles dolgozatok.</p>
			</div>
		</div>
		{#if err}
			<p role="alert" class="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
		{/if}
		{#if loading}
			<p class="mt-3 text-sm text-stone-500 dark:text-stone-400">Betöltés…</p>
		{/if}
	</section>

	<!-- Házik / dolgozatok -->
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<h2 class="flex items-center gap-2 text-[16px] font-bold text-ink-900 dark:text-white">
			<CalendarDays size={18} class="text-ink-400 dark:text-stone-500" /> Kiadott feladatok
		</h2>
		{#if assigns.length === 0 && !loading}
			<p class="mt-2 text-sm text-stone-500 dark:text-stone-400">Még nincs kiadott feladat. Csatlakozz egy osztályhoz kóddal!</p>
		{:else}
			<ul class="mt-3 space-y-2.5">
				{#each assigns as a (a.id)}
					<li class="flex items-center gap-3.5 rounded-xl border border-stone-100 p-3.5 dark:border-white/10">
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

	<!-- Osztályaim -->
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<h2 class="flex items-center gap-2 text-[16px] font-bold text-ink-900 dark:text-white">
			<Trophy size={18} class="text-amber-500" /> Osztályaim
		</h2>
		<ul class="mt-3 space-y-2">
			{#each rooms as r (r.id)}
				<li>
					<a
						href="/tanterem/{r.id}"
						class="flex items-center gap-3 rounded-xl bg-stone-100 px-3.5 py-2.5 transition hover:bg-stone-200/70 dark:bg-white/5 dark:hover:bg-white/10"
					>
						<span class="flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">{r.name}</span>
						<span class="text-xs font-bold text-stone-400 dark:text-stone-500">{r.members ?? 0} fő · {r.code}</span>
					</a>
				</li>
			{:else}
				{#if !loading}<p class="text-sm text-stone-500 dark:text-stone-400">Még nem vagy egy osztályban sem.</p>{/if}
			{/each}
		</ul>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				join();
			}}
			class="mt-3 flex gap-2"
		>
			<input
				bind:value={joinCode}
				placeholder="Osztálykód (pl. X7K2QA)"
				autocomplete="off"
				class="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] uppercase text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
			/>
			<button type="submit" class="shrink-0 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-ink-900">
				Csatlakozás
			</button>
		</form>
		{#if isTeacher}
			<form
				onsubmit={(e) => {
					e.preventDefault();
					createRoom();
				}}
				class="mt-2 flex gap-2"
			>
				<input
					bind:value={newRoom}
					placeholder="Új osztály neve (pl. 7.B Angol)"
					class="min-w-0 flex-1 rounded-xl border border-dashed border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-transparent dark:text-white"
				/>
				<button type="submit" class="inline-flex shrink-0 items-center gap-1 rounded-full border border-stone-300 px-5 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-stone-50 dark:border-white/15 dark:text-stone-300">
					<Plus size={15} /> Létrehozás
				</button>
			</form>
		{/if}
	</section>

	<!-- Tanári dolgozat-kiadó -->
	{#if isTeacher}
		<section class="mt-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-5 sm:p-6 dark:border-brand-500/30 dark:bg-brand-500/10">
			<h2 class="text-[16px] font-bold text-ink-900 dark:text-white">Dolgozat / házi kiadása</h2>
			<p class="mt-0.5 text-[13px] text-ink-600 dark:text-stone-400">
				A rendszer a témakör szókincséből automatikusan generálja a feladatsort.
			</p>
			<div class="mt-3 grid gap-2.5 sm:grid-cols-2">
				<select bind:value={aTopic} class="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-white/5 dark:text-white">
					{#each topics as t (t.id)}
						<option value={t.id}>{t.title}</option>
					{/each}
				</select>
				<select bind:value={aClass} class="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-white/5 dark:text-white">
					{#each rooms as r (r.id)}
						<option value={r.id}>{r.name}</option>
					{/each}
				</select>
				<input
					bind:value={aTitle}
					placeholder="Cím (pl. Unit 3 témazáró)"
					class="rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] sm:col-span-2 dark:border-white/15 dark:bg-white/5 dark:text-white"
				/>
				<label class="flex items-center gap-2 text-sm text-ink-600 dark:text-stone-300">
					Kérdésszám
					<input type="number" min="3" max="30" bind:value={aCount} class="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5 dark:text-white" />
				</label>
				<label class="flex items-center gap-2 text-sm text-ink-600 dark:text-stone-300">
					Határidő
					<input type="datetime-local" bind:value={aDue} class="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5 dark:text-white" />
				</label>
				<label class="flex items-center gap-2 text-sm text-ink-600 dark:text-stone-300">
					Próbálkozás (0 = korlátlan)
					<input type="number" min="0" max="20" bind:value={aAttempts} class="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5 dark:text-white" />
				</label>
				<label class="flex items-center gap-2 text-sm text-ink-600 dark:text-stone-300">
					Időkorlát (perc, 0 = nincs)
					<input type="number" min="0" max="180" bind:value={aTime} class="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5 dark:text-white" />
				</label>
				<label class="flex items-center gap-2 text-sm text-ink-600 dark:text-stone-300">
					<input type="checkbox" bind:checked={aShuffle} class="size-4 accent-brand-500" /> Kérdések keverése
				</label>
				<label class="flex items-center gap-2 text-sm text-ink-600 dark:text-stone-300">
					<input type="checkbox" bind:checked={aDelayed} class="size-4 accent-brand-500" /> Eredmény csak határidő után
				</label>
				<label class="flex items-center gap-2 text-sm font-semibold text-ink-900 sm:col-span-2 dark:text-white">
					<input type="checkbox" bind:checked={aExam} class="size-4 accent-red-500" /> Szigorú dolgozat mód (1 próbálkozás javasolt)
				</label>
			</div>
			{#if aExam && aAttempts !== 1}
				<p class="mt-2 text-[13px] font-medium text-amber-700 dark:text-amber-300">
					Dolgozathoz állítsd a próbálkozást 1-re a szigorú módhoz.
				</p>
			{/if}
			{#if aMsg}
				<p class="mt-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-medium text-ink-900 dark:bg-white/10 dark:text-white">{aMsg}</p>
			{/if}
			<button
				onclick={publish}
				disabled={aBusy}
				class="mt-3 w-full rounded-full bg-brand-500 px-4 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99] disabled:opacity-60"
			>
				{aBusy ? 'Kiadás…' : 'Feladatsor generálása + kiadás'}
			</button>
		</section>
	{/if}
{/if}

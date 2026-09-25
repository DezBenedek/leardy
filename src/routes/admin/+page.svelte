<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowLeft, Check, Copy, KeyRound, Search, ShieldCheck } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { studyApi, type AdminUser, type AdminUserDetail } from '$lib/study';

	let user = $derived(auth.user);
	let isAdmin = $derived((user?.is_admin ?? 0) === 1);

	let q = $state('');
	let debounced = $state('');
	let users = $state<AdminUser[]>([]);
	let err = $state<string | null>(null);
	let loading = $state(false);

	let sel = $state<AdminUserDetail | null>(null);
	let detailOpen = $state(false);
	let detailErr = $state<string | null>(null);
	let busy = $state(false);

	let customPw = $state('');
	let tempPw = $state<string | null>(null);
	let copied = $state(false);

	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const v = q;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			debounced = v;
		}, 300);
		return () => {
			if (timer) clearTimeout(timer);
		};
	});

	async function load() {
		if (!isAdmin) return;
		loading = true;
		err = null;
		try {
			users = (await studyApi.adminUsers(debounced)).users;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loading = false;
		}
	}

	onMount(() => void load());

	$effect(() => {
		void debounced;
		void auth.user;
		void load();
	});

	async function openDetail(u: AdminUser) {
		detailErr = null;
		tempPw = null;
		customPw = '';
		copied = false;
		try {
			sel = (await studyApi.adminUser(u.id)).user;
			detailOpen = true;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function setRole(role: string) {
		if (!sel || busy) return;
		busy = true;
		detailErr = null;
		try {
			await studyApi.adminSetRole(sel.id, role);
			sel = { ...sel, role };
			users = users.map((x) => (x.id === sel!.id ? { ...x, role } : x));
		} catch (e) {
			detailErr = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	async function issuePassword() {
		if (!sel || busy) return;
		busy = true;
		detailErr = null;
		tempPw = null;
		copied = false;
		try {
			const r = await studyApi.adminSetPassword(sel.id, customPw.trim() || undefined);
			tempPw = r.temp_password;
			customPw = '';
		} catch (e) {
			detailErr = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	async function copyPw() {
		if (!tempPw) return;
		try {
			await navigator.clipboard.writeText(tempPw);
			copied = true;
			setTimeout(() => (copied = false), 2500);
		} catch {
			// vágólap nem megy: kijelölhető szövegként ott marad
		}
	}

	function fmtDate(ts: number): string {
		return new Date(ts).toLocaleString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>Admin — Leardy</title>
</svelte:head>

<div class="mt-3 flex items-center gap-2">
	<a
		href="/"
		aria-label="Vissza a főoldalra"
		class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-900 transition hover:bg-stone-50 active:scale-95 dark:hover:bg-white/10 dark:border-white/10 dark:bg-stone-900 dark:text-white"
	>
		<ArrowLeft size={20} />
	</a>
	<h1 class="flex min-w-0 flex-1 items-center gap-2 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">
		<ShieldCheck size={22} class="shrink-0 text-brand-600 dark:text-white" /> Admin
	</h1>
</div>

{#if !user}
	<button
		onclick={() => authUI.show('login')}
		class="mt-3 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white"
	>
		Bejelentkezés
	</button>
{:else if !isAdmin}
	<section class="mt-3 rounded-[24px] border border-stone-200 bg-white p-8 text-center dark:border-white/10 dark:bg-stone-900">
		<p class="text-[16px] font-bold text-ink-900 dark:text-white">Nincs jogosultságod</p>
		<p class="mx-auto mt-1 max-w-xs text-sm text-stone-500 dark:text-stone-400">Ez a felület csak a superadminnak érhető el.</p>
	</section>
{:else}
	<div class="relative mt-3">
		<Search size={18} class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-stone-400" />
		<input
			bind:value={q}
			type="search"
			placeholder="Keresés név vagy e-mail alapján…"
			autocomplete="off"
			aria-label="Fiók keresése"
			class="w-full rounded-full border border-stone-200 bg-white py-3 pr-4 pl-11 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-stone-900 dark:text-white"
		/>
	</div>

	{#if err}
		<p role="alert" class="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
	{/if}

	<div class="mt-3 space-y-2">
		{#each users as u, i (u.id)}
			<button
				onclick={() => void openDetail(u)}
				style="--d:{Math.min(i * 40, 240)}ms"
				class="anim-rise flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3.5 text-left transition hover:bg-stone-50 active:scale-[0.995] dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
			>
				<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-[15px] font-extrabold text-ink-600 uppercase dark:bg-white/10 dark:text-white">
					{u.name.trim().charAt(0)}
				</span>
				<span class="min-w-0 flex-1">
					<span class="flex items-center gap-1.5">
						<span class="truncate text-[15px] font-bold text-ink-900 dark:text-white">{u.name}</span>
						{#if u.is_admin === 1}
							<span class="shrink-0 rounded-full bg-ink-900 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-white uppercase dark:bg-white dark:text-ink-900">Admin</span>
						{:else}
							<span class="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-stone-500 uppercase dark:bg-white/10 dark:text-stone-300">
								{u.role === 'teacher' ? 'Tanár' : 'Diák'}
							</span>
						{/if}
					</span>
					<span class="block truncate text-[13px] text-stone-500 dark:text-stone-400">
						{u.email} · {u.topics} témakör · {u.classrooms} osztály
					</span>
				</span>
			</button>
		{:else}
			<p class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">
				{loading ? 'Keresés…' : 'Nincs találat.'}
			</p>
		{/each}
	</div>
{/if}

<Drawer open={detailOpen} label="Fiók kezelése" onClose={() => (detailOpen = false)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		{#if sel}
			<h2 class="font-display truncate text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">{sel.name}</h2>
			<p class="mt-0.5 truncate text-sm text-stone-500 dark:text-stone-400">{sel.email} · regisztrált: {fmtDate(sel.created_at)}</p>

			{#if detailErr}
				<p role="alert" class="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{detailErr}</p>
			{/if}

			<div class="mt-4 grid grid-cols-4 gap-1.5 text-center">
				{#each [['XP', sel.xp], ['Sorozat', sel.streak], ['Témakör', sel.topics], ['Osztály', sel.classrooms], ['Kvíz', sel.assessments], ['Felvett', sel.enrollments], ['Tag itt', sel.member_classes], ['Beadás', sel.submissions]] as [label, v] (label)}
					<div class="rounded-xl bg-stone-100 px-1 py-2 dark:bg-white/5">
						<p class="text-[16px] font-extrabold text-ink-900 tabular-nums dark:text-white">{v}</p>
						<p class="text-[11px] font-bold text-stone-500 dark:text-stone-400">{label}</p>
					</div>
				{/each}
			</div>

			<p class="mt-4 text-[13px] font-bold text-ink-900 dark:text-white">Szerep</p>
			<div class="mt-1.5 grid grid-cols-2 gap-1.5" role="group" aria-label="Szerep">
				{#each [{ id: 'student', label: 'Diák' }, { id: 'teacher', label: 'Tanár' }] as r (r.id)}
					<button
						disabled={busy}
						onclick={() => void setRole(r.id)}
						aria-pressed={sel.role === r.id}
						class={['rounded-xl py-2.5 text-[14px] font-bold transition active:scale-95 disabled:opacity-60', sel.role === r.id ? 'bg-ink-900 text-white shadow-sm dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
					>
						{r.label}
					</button>
				{/each}
			</div>

			<p class="mt-4 text-[13px] font-bold text-ink-900 dark:text-white">Ideiglenes jelszó</p>
			<p class="mt-0.5 text-[13px] text-stone-500 dark:text-stone-400">
				A fiók mindenhonnan kijelentkezik, legközelebb az új jelszó kell.
			</p>
			<input
				bind:value={customPw}
				placeholder="Egyedi jelszó (opcionális, min. 8 karakter)"
				autocomplete="off"
				aria-label="Egyedi jelszó"
				class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-sm text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
			/>
			<button
				disabled={busy}
				onclick={() => void issuePassword()}
				class="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
			>
				<KeyRound size={17} /> {busy ? 'Kiadás…' : customPw.trim() ? 'Jelszó beállítása' : 'Ideiglenes jelszó generálása'}
			</button>
			{#if tempPw}
				<div class="anim-pop mt-2.5 rounded-2xl border-2 border-dashed border-brand-500 bg-brand-50 p-4 text-center dark:bg-brand-500/10">
					<p class="text-[12px] font-extrabold tracking-wide text-brand-700 uppercase dark:text-brand-300">Csak most látható — add át a tulajnak!</p>
					<p class="mt-1.5 font-mono text-[22px] font-extrabold tracking-wider text-ink-900 select-all dark:text-white">{tempPw}</p>
					<button
						onclick={() => void copyPw()}
						class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-bold text-white transition active:scale-95 dark:bg-white dark:text-ink-900"
					>
						{#if copied}<Check size={15} strokeWidth={3} /> Másolva!{:else}<Copy size={15} /> Másolás{/if}
					</button>
				</div>
			{/if}
		{/if}
	</div>
</Drawer>

<script lang="ts">
	import { History, SlidersHorizontal } from '@lucide/svelte';
	import { roleLabel } from '$lib/admin/roles';
	import { toast } from '$lib/state/toast.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import SearchInput from '$lib/ui/SearchInput.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface Row {
		id: string; name: string; email: string; role: string; school_id: string;
		suspended_until: number; muted_until: number; suspended_reason: string; muted_reason: string;
	}

	let q = $state('');
	let role = $state('all');
	let onlyRestricted = $state(false);
	let searchFocus = $state(false);
	let filterOpen = $state(false);
	let historyOpen = $state(false);
	let items = $state<Row[]>([]);
	let total = $state(0);
	let moreBusy = $state(false);
	let loading = $state(true);
	let error = $state('');
	let target = $state<Row | null>(null);
	let kind = $state<'ban' | 'mute'>('ban');
	let days = $state(7);
	let reason = $state('');
	let busy = $state(false);
	let actions = $state<{ id: string; actor: string; target: string; action: string; reason: string; createdAt: number }[]>([]);
	let detail = $state<null | {
		user: Row & { xp: number; streak: number; created_at: number };
		stats: { lessonsDone: number; lastActive: number | null; submissions: number; submitted: number };
		teaching: { id: string; name: string; members: number }[];
		joined: { id: string; name: string }[];
		history: { action: string; reason: string; createdAt: number; actor: string }[];
	}>(null);
	let detailBusy = $state(false);

	async function load() {
		if (data.forbidden) {
			loading = false;
			return;
		}
		loading = true;
		error = '';
		try {
			const params = new URLSearchParams({ q, role, limit: '30', offset: '0' });
			if (onlyRestricted) params.set('restricted', '1');
			const u = await fetch(`/api/admin/users?${params}`, { credentials: 'same-origin' });
			if (!u.ok) throw new Error((await u.json().catch(() => ({}))).error ?? 'Lista nem tölthető.');
			const j = await u.json();
			items = j.items ?? [];
			total = j.total ?? 0;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loading = false;
		}
	}

	async function loadActions() {
		try {
			const a = await fetch('/api/admin/actions', { credentials: 'same-origin' });
			if (a.ok) actions = (await a.json()).items ?? [];
		} catch {
			// néma hiba
		}
	}

	let timer: ReturnType<typeof setTimeout>;
	let detailGen = 0;
	let firstRun = true;

	$effect(() => {
		void q;
		void role;
		void onlyRestricted;
		if (data.forbidden) {
			loading = false;
			return;
		}
		if (firstRun) {
			firstRun = false;
			void load();
			return;
		}
		clearTimeout(timer);
		timer = setTimeout(() => void load(), 350);
		return () => clearTimeout(timer);
	});

	async function loadMore() {
		if (moreBusy || items.length >= total) return;
		moreBusy = true;
		try {
			const params = new URLSearchParams({ q, role, limit: '30', offset: String(items.length) });
			if (onlyRestricted) params.set('restricted', '1');
			const res = await fetch(`/api/admin/users?${params}`, { credentials: 'same-origin' });
			if (res.ok) {
				const j = await res.json();
				items = [...items, ...(j.items ?? [])];
				total = j.total ?? total;
			}
		} finally {
			moreBusy = false;
		}
	}

	const roleFilters = [
		{ id: 'all', label: 'Mind' },
		{ id: 'student', label: 'Diák' },
		{ id: 'teacher', label: 'Tanár' },
		{ id: 'school_leader', label: 'Vezető' },
		{ id: 'admin', label: 'Admin' },
		{ id: 'developer', label: 'Fejlesztő' }
	];

	let activeFilterCount = $derived((role !== 'all' ? 1 : 0) + (onlyRestricted ? 1 : 0));

	function resetFilters() {
		role = 'all';
		onlyRestricted = false;
	}

	function actionLabel(a: string): string {
		if (a === 'ban') return 'Tiltás';
		if (a === 'mute') return 'Némítás';
		if (a === 'unban') return 'Feloldás tiltásból';
		if (a === 'unmute') return 'Feloldás némításból';
		if (a === 'publish') return 'Közzététel';
		if (a === 'unpublish') return 'Visszavonás';
		if (a.startsWith('role:')) return `Szerep: ${a.slice(5)}`;
		return a;
	}

	$effect(() => {
		if (!data.forbidden) void loadActions();
	});

	async function openDetail(row: Row) {
		const gen = ++detailGen;
		detail = null;
		detailBusy = true;
		try {
			const res = await fetch(`/api/admin/user-detail?id=${encodeURIComponent(row.id)}`, { credentials: 'same-origin' });
			if (gen !== detailGen) return;
			if (res.ok) detail = await res.json();
		} finally {
			if (gen === detailGen) detailBusy = false;
		}
		if (gen === detailGen && !detail) {
			toast.error('Nem tölthető a részletező');
			return;
		}
	}

	async function unrestrictDetail(kind: 'ban' | 'mute') {
		if (!detail) return;
		const res = await fetch('/api/admin/users', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify({ action: 'unrestrict', targetId: detail.user.id, kind })
		});
		if (!res.ok) {
			toast.error('Nem sikerült feloldani');
			return;
		}
		toast.success('Feloldva');
		detail = null;
		await load();
		void loadActions();
	}

	function fmtUntil(t: number): string {
		if (!t || t <= Date.now()) return '';
		return fmtDateTime(t);
	}

	function fmtDateTime(t: number): string {
		return new Date(t).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!target || busy) return;
		busy = true;
		try {
			const res = await fetch('/api/admin/users', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ targetId: target.id, kind, days, reason })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült', j.error ?? 'Próbáld újra.');
				return;
			}
			toast.success(kind === 'ban' ? 'Fiók felfüggesztve' : 'Felhasználó némítva');
			target = null;
			reason = '';
			await load();
			void loadActions();
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Moderálás | Leardy</title>
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
		<h1 class="font-display truncate text-[22px] font-extrabold tracking-tight whitespace-nowrap text-ink-900 dark:text-white">Moderálás</h1>
	</div>
	<SearchInput
		bind:value={q}
		placeholder="Keresés…"
		ariaLabel="Felhasználó keresése"
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
				ariaLabel="Legutóbbi műveletek"
				size={46}
				disabled={searchFocus}
				onclick={() => (historyOpen = true)}
			>
				<History size={22} />
			</IconButton>
		</div>
	</div>
</div>
<p class="mt-2 px-1 text-[12px] font-bold text-stone-400">{items.length} / {total}</p>

{#if error}
	<p class="mt-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
{/if}

<ul class="mt-2 grid gap-2">
	{#each items as row (row.id)}
		{@const banned = row.suspended_until > Date.now()}
		{@const muted = row.muted_until > Date.now()}
		<li class="rounded-2xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-stone-900">
			<button type="button" onclick={() => void openDetail(row)} class="flex w-full items-center gap-2.5 text-left">
				<span class="grid size-8 shrink-0 place-items-center rounded-full bg-stone-100 text-[13px] font-extrabold text-stone-500 dark:bg-white/10 dark:text-stone-300">
					{row.name.trim().charAt(0).toUpperCase()}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[14px] font-bold">{row.name}</span>
					<span class="block truncate text-[12px] text-stone-500">{row.email} · {roleLabel(row.role)}</span>
				</span>
				{#if banned}
					<span class="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-600 dark:text-red-300">Tiltva</span>
				{:else if muted}
					<span class="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-200">Némítva</span>
				{/if}
			</button>
		</li>
	{/each}
</ul>
{#if items.length < total}
	<button
		type="button"
		onclick={() => void loadMore()}
		disabled={moreBusy}
		class="mt-2 w-full rounded-full border border-stone-200 px-4 py-2.5 text-[13px] font-bold disabled:opacity-50 dark:border-white/10"
	>
		{moreBusy ? 'Betöltés…' : `Továbbiak (${items.length} / ${total})`}
	</button>
{/if}

{#if target}
	{@const t = target}
	<Drawer open={target !== null} label="Korlátozás" title={t.name} onClose={() => { if (!busy) target = null; }}>
		<p class="-mt-1 text-[13px] text-stone-500">{t.email} · {roleLabel(t.role)}</p>
		<form onsubmit={submit} class="mt-3 grid gap-2.5">
			<div class="grid grid-cols-2 gap-2">
				<button type="button" onclick={() => (kind = 'ban')} class={['rounded-2xl border p-3 text-left transition active:scale-[0.99]', kind === 'ban' ? 'border-red-500 bg-red-50 dark:bg-red-500/10' : 'border-stone-200 dark:border-white/10']}>
					<span class="block text-[14px] font-bold">Tiltás</span>
					<span class="block text-[12px] text-stone-500">Nem tud belépni</span>
				</button>
				<button type="button" onclick={() => (kind = 'mute')} class={['rounded-2xl border p-3 text-left transition active:scale-[0.99]', kind === 'mute' ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10' : 'border-stone-200 dark:border-white/10']}>
					<span class="block text-[14px] font-bold">Némítás</span>
					<span class="block text-[12px] text-stone-500">Csak olvashat</span>
				</button>
			</div>
			<label class="block text-[13px] font-bold">
				Időtartam: {days} nap
				<input type="range" min={1} max={90} bind:value={days} class="mt-1 w-full accent-brand-500" />
			</label>
			<label class="block text-[13px] font-bold">
				Indok kötelező
				<textarea bind:value={reason} rows={3} maxlength={300} placeholder="Miért szükséges a korlátozás?" class="mt-1 w-full rounded-2xl border border-stone-200 px-3 py-2 text-[14px] font-normal outline-none focus:border-brand-500 dark:border-white/10 dark:bg-stone-950"></textarea>
			</label>
			<div class="flex gap-2">
				<button type="button" onclick={() => (target = null)} class="flex-1 rounded-full border border-stone-200 px-4 py-2.5 text-[14px] font-bold dark:border-white/10">Mégse</button>
				<button type="submit" disabled={busy || !reason.trim()} class="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50">
					{busy ? 'Mentés…' : 'Korlátozás'}
				</button>
			</div>
		</form>
	</Drawer>
{/if}

<Drawer open={filterOpen} label="Szűrők" title="Szűrők" onClose={() => (filterOpen = false)}>
	<p class="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Szerep</p>
	<div role="group" aria-label="Szerep szűrő" class="mt-1 grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-white/10">
		{#each roleFilters as f (f.id)}
			{@const selected = role === f.id}
			<button
				type="button"
				aria-pressed={selected}
				onclick={() => (role = f.id)}
				class={[
					'rounded-xl px-2 py-2 text-[13px] leading-none transition active:scale-[0.97]',
					selected
						? 'bg-white font-extrabold text-ink-900 shadow-sm dark:bg-stone-800 dark:text-white'
						: 'font-semibold text-stone-500 hover:text-ink-900 dark:text-stone-400 dark:hover:text-white'
				]}
			>
				{f.label}
			</button>
		{/each}
	</div>
	<label class="mt-3 flex cursor-pointer items-center justify-between gap-2 rounded-2xl border border-stone-200 px-4 py-3 dark:border-white/10">
		<span class="text-[14px] font-bold">Csak korlátozottak</span>
		<input type="checkbox" checked={onlyRestricted} onchange={(e) => (onlyRestricted = (e.target as HTMLInputElement).checked)} class="size-4 accent-red-500" />
	</label>
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

<Drawer open={historyOpen} label="Legutóbbi műveletek" title="Műveletek" onClose={() => (historyOpen = false)} wide>
	{#if actions.length === 0}
		<p class="mt-1 rounded-xl bg-stone-100 p-3 text-[13px] text-stone-500 dark:bg-white/5">Még nincs bejegyzés.</p>
	{:else}
		<ul class="mt-1 grid gap-1.5">
			{#each actions as a (a.id)}
				<li class="truncate rounded-xl bg-stone-100 px-3 py-2 text-[13px] dark:bg-white/5">
					<span class="font-bold">{actionLabel(a.action)}</span>
					<span class="text-stone-500"> · {a.actor} → {a.target}</span>
					{#if a.reason}<span class="block truncate text-[12px] text-stone-500">{a.reason}</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</Drawer>

<Drawer
	open={detail !== null || detailBusy}
	label={detail?.user.name ?? 'Felhasználó részletei'}
	title={detail?.user.name ?? 'Betöltés…'}
	onClose={() => { detail = null; detailGen++; }}
	wide
>
	{#if detailBusy && !detail}
		<p class="py-6 text-center text-sm text-stone-500">Betöltés…</p>
	{:else if detail}
		{@const d = detail}
		{@const banned = d.user.suspended_until > Date.now()}
		{@const muted = d.user.muted_until > Date.now()}
		<div class="grid gap-3">
			<div class="rounded-2xl bg-stone-100 p-3.5 dark:bg-white/5">
				<p class="text-[14px] font-bold">{d.user.email}</p>
				<p class="text-[12px] text-stone-500">{d.user.role}{d.user.school_id ? ` · ${d.user.school_id}` : ''} · {d.user.xp} XP · {d.user.streak} nap sorozat</p>
				<p class="mt-1 text-[12px] text-stone-500">
					{d.stats.lessonsDone} lecke kész · {d.stats.submitted}/{d.stats.submissions} beadva ·
					{#if d.stats.lastActive}utoljára {fmtDateTime(d.stats.lastActive)}{:else}még nincs aktivitás{/if}
				</p>
				{#if banned}<p class="mt-1.5 rounded-xl bg-red-500/10 px-2.5 py-1 text-[12px] font-bold text-red-700 dark:text-red-300">Tiltva {fmtUntil(d.user.suspended_until)}ig · {d.user.suspended_reason}</p>{/if}
				{#if muted}<p class="mt-1.5 rounded-xl bg-amber-500/10 px-2.5 py-1 text-[12px] font-bold text-amber-800 dark:text-amber-200">Némítva {fmtUntil(d.user.muted_until)}ig · {d.user.muted_reason}</p>{/if}
			</div>
			{#if d.teaching.length > 0}
				<div>
					<p class="text-[13px] font-extrabold">Tanított osztályok</p>
					<ul class="mt-1.5 grid gap-1.5">
						{#each d.teaching as c (c.id)}
							<li class="flex items-center justify-between gap-2 rounded-xl bg-stone-100 px-3 py-2 text-[13px] dark:bg-white/5">
								<span class="truncate font-medium">{c.name}</span>
								<span class="shrink-0 text-[12px] text-stone-500">{c.members} fő</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if d.joined.length > 0}
				<div>
					<p class="text-[13px] font-extrabold">Csatlakozott osztályok</p>
					<ul class="mt-1.5 grid gap-1.5">
						{#each d.joined as c (c.id)}
							<li class="truncate rounded-xl bg-stone-100 px-3 py-2 text-[13px] dark:bg-white/5">{c.name}</li>
						{/each}
					</ul>
				</div>
			{/if}
			<div>
				<p class="text-[13px] font-extrabold">Korábbi intézkedések</p>
				{#if d.history.length === 0}
					<p class="mt-1 text-[13px] text-stone-500">Nincs rögzített intézkedés.</p>
				{:else}
					<ul class="mt-1.5 grid gap-1.5">
						{#each d.history as h, i (i)}
							<li class="rounded-xl bg-stone-100 px-3 py-2 text-[12.5px] dark:bg-white/5">
								<span class="font-bold">{actionLabel(h.action)}</span>
								<span class="text-stone-500"> · {h.actor} · {fmtDateTime(h.createdAt)}</span>
								{#if h.reason}<span class="block text-stone-600 dark:text-stone-300">{h.reason}</span>{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
			<div class="flex gap-2">
				<button
					type="button"
					onclick={() => {
						const row = items.find((x) => x.id === d.user.id) ?? {
							id: d.user.id, name: d.user.name, email: d.user.email, role: d.user.role,
							school_id: d.user.school_id, suspended_until: d.user.suspended_until,
							muted_until: d.user.muted_until, suspended_reason: d.user.suspended_reason,
							muted_reason: d.user.muted_reason
						};
						target = row; kind = 'ban'; days = 7; reason = '';
					}}
					class="flex-1 rounded-full border border-red-200 px-4 py-2.5 text-[13px] font-bold text-red-600 dark:border-red-500/30 dark:text-red-300"
				>
					Korlátozás
				</button>
				{#if banned}
					<button type="button" onclick={() => void unrestrictDetail('ban')} class="flex-1 rounded-full bg-ink-900 px-4 py-2.5 text-[13px] font-bold text-white dark:bg-white dark:text-ink-900">Tiltás feloldása</button>
				{:else if muted}
					<button type="button" onclick={() => void unrestrictDetail('mute')} class="flex-1 rounded-full bg-ink-900 px-4 py-2.5 text-[13px] font-bold text-white dark:bg-white dark:text-ink-900">Némítás feloldása</button>
				{/if}
			</div>
		</div>
	{/if}
</Drawer>

{/if}

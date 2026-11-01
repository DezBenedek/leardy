<script lang="ts">
	import { toast } from '$lib/state/toast.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface Row {
		id: string; name: string; email: string; role: string; school_id: string;
		suspended_until: number; muted_until: number; suspended_reason: string; muted_reason: string;
	}

	let q = $state('');
	let role = $state('all');
	let onlyRestricted = $state(false);
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
			const [u, a] = await Promise.all([
				fetch(`/api/admin/users?${params}`, { credentials: 'same-origin' }),
				fetch('/api/admin/actions', { credentials: 'same-origin' })
			]);
			if (!u.ok) throw new Error((await u.json().catch(() => ({}))).error ?? 'Lista nem tölthető.');
			const j = await u.json();
			items = j.items ?? [];
			total = j.total ?? 0;
			if (a.ok) actions = (await a.json()).items ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loading = false;
		}
	}

	let timer: ReturnType<typeof setTimeout>;
	let detailGen = 0;

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
	function schedule() {
		clearTimeout(timer);
		timer = setTimeout(() => void load(), 350);
	}

	$effect(() => {
		void load();
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
		} finally {
			busy = false;
		}
	}

	async function unrestrict(row: Row, k: 'ban' | 'mute') {
		const res = await fetch('/api/admin/users', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify({ action: 'unrestrict', targetId: row.id, kind: k })
		});
		if (!res.ok) {
			toast.error('Nem sikerült feloldani');
			return;
		}
		toast.success('Feloldva');
		await load();
	}
</script>

<svelte:head>
	<title>Moderálás | Leardy</title>
</svelte:head>

{#if data.forbidden}
	<div class="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
		<p class="font-bold text-ink-900 dark:text-white">Nincs jogosultságod ehhez az oldalhoz</p>
		<p class="mt-1 text-sm text-stone-500">Admin vagy fejlesztői szerep kell.</p>
	</div>
{:else}
<div class="grid gap-2 rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
	<div class="flex flex-wrap gap-2">
		<input
			type="search"
			placeholder="Keresés név vagy e-mail alapján"
			value={q}
			oninput={(e) => { q = (e.target as HTMLInputElement).value; schedule(); }}
			aria-label="Felhasználó keresése"
			class="min-w-0 flex-1 rounded-full border border-stone-200 px-4 py-2 text-[14px] outline-none focus:border-brand-500 dark:border-white/10 dark:bg-stone-950"
		/>
	</div>
	<div class="flex flex-wrap gap-1.5" role="group" aria-label="Szerep szűrő">
		{#each roleFilters as f (f.id)}
			<button
				type="button"
				onclick={() => { role = f.id; void load(); }}
				aria-pressed={role === f.id}
				class={['rounded-full px-3.5 py-1.5 text-[13px] font-bold transition active:scale-95', role === f.id ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-stone-600 dark:bg-white/5 dark:text-stone-300']}
			>
				{f.label}
			</button>
		{/each}
		<label class="ml-auto flex items-center gap-2 text-[13px] font-medium text-stone-600 dark:text-stone-300">
			<input type="checkbox" checked={onlyRestricted} onchange={(e) => { onlyRestricted = (e.target as HTMLInputElement).checked; void load(); }} class="size-4 accent-red-500" />
			Csak korlátozottak
		</label>
	</div>
	<p class="text-[12px] font-bold text-stone-400">{items.length} / {total} találat</p>
</div>

{#if error}
	<p class="mt-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
{/if}

<ul class="mt-2 grid gap-2">
	{#each items as row (row.id)}
		{@const banned = row.suspended_until > Date.now()}
		{@const muted = row.muted_until > Date.now()}
		<li class="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-stone-900">
			<button type="button" onclick={() => void openDetail(row)} class="flex w-full items-center gap-2 text-left">
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[14px] font-bold">{row.name}</span>
					<span class="block truncate text-[12px] text-stone-500">{row.email} · {row.role}</span>
				</span>
				<span class="grid size-7 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-400 dark:bg-white/10">›</span>
			</button>
			<div class="mt-1 flex items-center gap-2">
				<button
					type="button"
					onclick={() => { target = row; kind = 'ban'; days = 7; reason = ''; }}
					class="shrink-0 rounded-full border border-red-200 px-3 py-1.5 text-[12px] font-bold text-red-600 dark:border-red-500/30 dark:text-red-300"
				>
					Korlátozás
				</button>
			</div>
			{#if banned || muted}
				<div class="mt-2 grid gap-1 text-[12px]">
					{#if banned}
						<p class="rounded-xl bg-red-500/10 px-2.5 py-1.5 text-red-700 dark:text-red-300">
							Tiltva {fmtUntil(row.suspended_until)}ig · {row.suspended_reason}
							<button type="button" onclick={() => void unrestrict(row, 'ban')} class="ml-2 font-bold underline">Feloldás</button>
						</p>
					{/if}
					{#if muted}
						<p class="rounded-xl bg-amber-500/10 px-2.5 py-1.5 text-amber-800 dark:text-amber-200">
							Némítva {fmtUntil(row.muted_until)}ig · {row.muted_reason}
							<button type="button" onclick={() => void unrestrict(row, 'mute')} class="ml-2 font-bold underline">Feloldás</button>
						</p>
					{/if}
				</div>
			{/if}
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
	<Drawer open={target !== null} label="Korlátozás" title={`Korlátozás: ${t.name}`} onClose={() => { if (!busy) target = null; }}>
		<p class="-mt-1 text-[13px] text-stone-500">{t.email} · {t.role}</p>
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

{#if actions.length > 0}
	<div class="mt-4 rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
		<p class="text-[13px] font-extrabold">Legutóbbi műveletek</p>
			<ul class="mt-2 grid gap-1 text-[12.5px] text-stone-600 dark:text-stone-300">
				{#each actions as a (a.id)}
					<li class="truncate">{a.actor} → {a.target}: {actionLabel(a.action)}{a.reason ? ` · ${a.reason}` : ''}</li>
				{/each}
			</ul>
	</div>
{/if}

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

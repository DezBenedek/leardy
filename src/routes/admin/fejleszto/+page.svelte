<script lang="ts">
	import { SlidersHorizontal } from '@lucide/svelte';
	import { toast } from '$lib/state/toast.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import SearchInput from '$lib/ui/SearchInput.svelte';
	import { ApiKeysStore } from '$lib/state/api-keys.svelte';
	import { roleLabel } from '$lib/admin/roles';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let email = $state('');
	let newRole = $state('school_leader');
	let busy = $state(false);
	let keys = $state<{ id: string; name: string; prefix: string; owner: string; email: string; schoolId: string; createdAt: number; lastUsedAt: number | null; revoked: boolean }[]>([]);
	let keysLoaded = $state(false);
	let log = $state<{ id: string; actor: string; target: string; action: string; reason: string; createdAt: number }[]>([]);
	let logTotal = $state(0);
	let logLoaded = $state(false);
	let logBusy = $state(false);
	let auditOpen = $state(false);
	let logOpen = $state(false);

	const api = new ApiKeysStore(() => !data.forbidden);

	let keyQuery = $state('');
	let keyStatus: 'all' | 'active' | 'revoked' = $state('all');
	let searchFocus = $state(false);
	let filterOpen = $state(false);

	let activeFilterCount = $derived(keyStatus !== 'all' ? 1 : 0);

	function resetKeyFilters() {
		keyStatus = 'all';
	}

	function matchKey(k: { name: string; prefix: string; owner?: string; email?: string }, statusOk: boolean): boolean {
		if (!statusOk) return false;
		const query = keyQuery.trim().toLowerCase();
		if (!query) return true;
		return `${k.name} ${k.prefix} ${k.owner ?? ''} ${k.email ?? ''}`.toLowerCase().includes(query);
	}

	let visibleOwnKeys = $derived(api.keys.filter((k) => matchKey(k, keyStatus === 'all' || (keyStatus === 'active') !== k.revoked)));
	let visibleAllKeys = $derived(keys.filter((k) => matchKey(k, keyStatus === 'all' || (keyStatus === 'active') !== k.revoked)));

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

	function fmtDate(d: number | null): string {
		if (!d) return 'még soha';
		return new Date(d).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
	}

	function fmtDateTime(t: number): string {
		return new Date(t).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	async function loadKeys() {
		if (data.forbidden || keysLoaded) return;
		try {
			const res = await fetch('/api/admin/keys', { credentials: 'same-origin' });
			if (res.ok) keys = (await res.json()).items ?? [];
		} catch {
			// néma hiba: a lista üres marad
		} finally {
			keysLoaded = true;
		}
	}

	async function loadLog(more = false) {
		if (data.forbidden || logBusy) return;
		logBusy = true;
		try {
			const res = await fetch(`/api/admin/actions?limit=20&offset=${more ? log.length : 0}`, { credentials: 'same-origin' });
			if (res.ok) {
				const j = await res.json();
				logTotal = j.total ?? 0;
				log = more ? [...log, ...(j.items ?? [])] : (j.items ?? []);
				logLoaded = true;
			}
		} catch {
			// néma hiba
		} finally {
			logBusy = false;
		}
	}

	$effect(() => {
		void loadKeys();
		void loadLog();
		if (!data.forbidden) void api.loadApiKeys();
	});
</script>

<svelte:head>
	<title>Fejlesztő | Leardy</title>
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
		<h1 class="font-display truncate text-[22px] font-extrabold tracking-tight whitespace-nowrap text-ink-900 dark:text-white">Fejlesztő</h1>
	</div>
	<SearchInput
		bind:value={keyQuery}
		placeholder="Keresés…"
		ariaLabel="Kulcs keresése"
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
</div>

<div class="mt-3 grid gap-2.5">
	<section class="rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
		<h2 class="text-[15px] font-extrabold">Szereposztás</h2>
		<form
			onsubmit={async (e) => {
				e.preventDefault();
				if (busy) return;
				busy = true;
				try {
					const res = await fetch('/api/admin/roles', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						credentials: 'same-origin',
						body: JSON.stringify({ email: email.trim(), role: newRole })
					});
					const j = await res.json().catch(() => ({}));
					if (!res.ok) {
						toast.error('Nem sikerült', j.error ?? 'Próbáld újra.');
						return;
					}
					toast.success('Szerep beállítva', `${email.trim()} → ${roleLabel(newRole)}`);
					email = '';
				} finally {
					busy = false;
				}
			}}
			class="mt-2.5 grid gap-2"
		>
			<input
				type="email"
				required
				placeholder="felhasznalo@szentangela.hu"
				bind:value={email}
				maxlength={254}
				aria-label="E-mail-cím"
				class="w-full rounded-2xl border border-stone-200 px-4 py-2.5 text-[14px] outline-none focus:border-brand-500 dark:border-white/10 dark:bg-stone-950"
			/>
			<div class="grid grid-cols-3 gap-2">
				{#each ['school_leader', 'admin', 'developer'] as r (r)}
					<button
						type="button"
						onclick={() => (newRole = r)}
						class={['rounded-2xl border px-3 py-2 text-[13px] font-bold transition active:scale-95', newRole === r ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-stone-200 text-stone-600 dark:border-white/10 dark:text-stone-300']}
					>
						{roleLabel(r)}
					</button>
				{/each}
			</div>
			<button
				type="submit"
				disabled={busy || !email.trim()}
				class="rounded-full bg-ink-900 px-5 py-2.5 text-[14px] font-bold text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-ink-900"
			>
				{busy ? 'Mentés…' : 'Szerep beállítása'}
			</button>
		</form>
	</section>

	<section class="rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
		<h2 class="text-[15px] font-extrabold">Saját API kulcsok</h2>
		{#if api.newSecret}
			<div class="mt-2.5 rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
				<p class="text-[13px] font-bold text-emerald-700 dark:text-emerald-300">Új kulcs elkészült, másold ki most</p>
				<p class="mt-1 rounded-xl bg-white px-3 py-2 font-mono text-[13px] break-all text-ink-900 dark:bg-black/30 dark:text-white">{api.newSecret}</p>
				<div class="mt-2 flex gap-2">
					<button type="button" onclick={() => api.copySecret()} class="rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-emerald-700">Másolás</button>
					<button type="button" onclick={() => (api.newSecret = null)} class="rounded-full border border-emerald-300 px-4 py-2 text-[13px] font-bold text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300">Elrejtés</button>
				</div>
			</div>
		{/if}
		<form onsubmit={(e) => api.createApiKey(e)} class="mt-2.5 flex gap-2">
			<input
				type="text"
				placeholder="Kulcs neve"
				bind:value={api.name}
				maxlength={60}
				disabled={api.busy}
				aria-label="Kulcs neve"
				class="min-w-0 flex-1 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-[14px] outline-none focus:border-brand-500 dark:border-white/10 dark:bg-stone-950"
			/>
			<button type="submit" disabled={api.busy} class="shrink-0 rounded-full bg-brand-500 px-5 py-2.5 text-[14px] font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 disabled:opacity-60">
				{api.busy ? 'Készül…' : 'Új kulcs'}
			</button>
		</form>
		{#if api.loading && !api.loaded}
			<p class="mt-2 text-sm text-stone-500">Betöltés…</p>
		{:else if visibleOwnKeys.length === 0}
			<p class="mt-2 rounded-xl bg-stone-100 p-3 text-[13px] text-stone-500 dark:bg-white/5">{keyQuery || keyStatus !== 'all' ? 'Nincs találat.' : 'Még nincs kulcsod.'}</p>
		{:else}
			<ul class="mt-2 grid gap-1.5">
				{#each visibleOwnKeys as k (k.id)}
					<li class="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/5">
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[14px] font-bold">{k.name} <span class="font-mono font-medium text-stone-400">{k.prefix}</span></span>
							<span class="block text-[12px] text-stone-500">Létrehozva {fmtDate(k.createdAt)} · használat {fmtDate(k.lastUsedAt)}</span>
						</span>
						<button
							type="button"
							onclick={() => api.revokeApiKey(k.id)}
							disabled={api.revokeBusy === k.id}
							class="shrink-0 rounded-full border border-red-200 px-3 py-1 text-[12px] font-bold text-red-600 disabled:opacity-50 dark:border-red-500/30 dark:text-red-300"
						>
							{api.revokeBusy === k.id ? '…' : 'Visszavonás'}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<div class="grid grid-cols-2 gap-2.5">
		<button
			type="button"
			onclick={() => (auditOpen = true)}
			class="rounded-2xl border border-stone-200 bg-white p-3.5 text-left transition active:scale-[0.99] dark:border-white/10 dark:bg-stone-900"
		>
			<span class="block text-[20px] font-extrabold text-ink-900 dark:text-white">{keysLoaded ? keys.filter((k) => !k.revoked).length : '·'}</span>
			<span class="block text-[12px] font-bold text-stone-500">Aktív kulcs összesen</span>
		</button>
		<button
			type="button"
			onclick={() => (logOpen = true)}
			class="rounded-2xl border border-stone-200 bg-white p-3.5 text-left transition active:scale-[0.99] dark:border-white/10 dark:bg-stone-900"
		>
			<span class="block text-[20px] font-extrabold text-ink-900 dark:text-white">{logTotal}</span>
			<span class="block text-[12px] font-bold text-stone-500">Naplóbejegyzés</span>
		</button>
	</div>
</div>

<Drawer open={auditOpen} label="Összes API kulcs" title="Összes kulcs" onClose={() => (auditOpen = false)} wide>
	<div class="flex items-center gap-2">
		<p class="flex-1 text-[12px] font-bold text-stone-400">{visibleAllKeys.length} / {keys.length}</p>
		<button type="button" onclick={() => { keysLoaded = false; void loadKeys(); }} class="text-[13px] font-bold text-brand-600 dark:text-brand-300">Frissítés</button>
	</div>
	{#if visibleAllKeys.length === 0}
		<p class="mt-2 rounded-xl bg-stone-100 p-3 text-[13px] text-stone-500 dark:bg-white/5">{keysLoaded ? 'Nincs találat.' : 'Betöltés…'}</p>
	{:else}
		<ul class="mt-2 grid gap-1.5">
			{#each visibleAllKeys as k (k.id)}
				<li class="rounded-xl bg-stone-100 px-3 py-2 text-[13px] dark:bg-white/5">
					<span class="block truncate font-bold">{k.name} <span class="font-mono font-medium text-stone-400">{k.prefix}</span></span>
					<span class="block truncate text-[12px] text-stone-500">{k.owner} · {k.email}{k.schoolId ? ` · ${k.schoolId}` : ''} · használat {fmtDate(k.lastUsedAt)}</span>
					<span class={['mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold', k.revoked ? 'bg-stone-200 text-stone-500' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300']}>
						{k.revoked ? 'Visszavonva' : 'Aktív'}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</Drawer>

<Drawer open={logOpen} label="Napló" title="Napló" onClose={() => (logOpen = false)} wide>
	{#if log.length === 0}
		<p class="mt-2 rounded-xl bg-stone-100 p-3 text-[13px] text-stone-500 dark:bg-white/5">{logLoaded ? 'Még nincs bejegyzés.' : 'Betöltés…'}</p>
	{:else}
		<ul class="mt-2 grid gap-1.5">
			{#each log as a (a.id + a.createdAt)}
				<li class="rounded-xl bg-stone-100 px-3 py-2 text-[13px] dark:bg-white/5">
					<span class="font-bold">{actionLabel(a.action)}</span>
					<span class="text-stone-500"> · {a.actor} → {a.target} · {fmtDateTime(a.createdAt)}</span>
					{#if a.reason}<span class="block truncate text-[12px] text-stone-500">{a.reason}</span>{/if}
				</li>
			{/each}
		</ul>
		{#if log.length < logTotal}
			<button
				type="button"
				onclick={() => void loadLog(true)}
				disabled={logBusy}
				class="mt-2 w-full rounded-full border border-stone-200 px-4 py-2 text-[13px] font-bold disabled:opacity-50 dark:border-white/10"
			>
				{logBusy ? 'Betöltés…' : `Továbbiak (${logTotal - log.length})`}
			</button>
		{/if}
	{/if}
</Drawer>

<Drawer open={filterOpen} label="Szűrők" title="Szűrők" onClose={() => (filterOpen = false)}>
	<p class="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Kulcs állapota</p>
	<div role="group" aria-label="Kulcs állapot szűrő" class="mt-1 grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-white/10">
		{#each [{ id: 'all', label: 'Mind' }, { id: 'active', label: 'Aktív' }, { id: 'revoked', label: 'Visszavont' }] as o (o.id)}
			{@const selected = keyStatus === o.id}
			<button
				type="button"
				aria-pressed={selected}
				onclick={() => (keyStatus = o.id as typeof keyStatus)}
				class={[
					'rounded-xl px-2 py-2 text-[13px] leading-none transition active:scale-[0.97]',
					selected
						? 'bg-white font-extrabold text-ink-900 shadow-sm dark:bg-stone-800 dark:text-white'
						: 'font-semibold text-stone-500 hover:text-ink-900 dark:text-stone-400 dark:hover:text-white'
				]}
			>
				{o.label}
			</button>
		{/each}
	</div>
	{#if activeFilterCount > 0}
		<button
			type="button"
			onclick={resetKeyFilters}
			class="mt-3 w-full rounded-full border border-stone-200 px-4 py-2.5 text-[13px] font-bold dark:border-white/10"
		>
			Szűrők törlése
		</button>
	{/if}
</Drawer>
{/if}

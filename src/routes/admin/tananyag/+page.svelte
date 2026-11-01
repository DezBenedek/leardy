<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface Level {
		id: string; title: string; subject_id: string; subject_title: string; owner_id: string | null;
		published: number; owner_email: string; lesson_count: number;
	}

	let q = $state('');
	let items = $state<Level[]>([]);
	let total = $state(0);
	let moreBusy = $state(false);
	let loading = $state(true);
	let error = $state('');
	let toggleBusy = $state<string | null>(null);
	const PAGE = 50;

	async function togglePublish(l: Level) {
		if (toggleBusy) return;
		toggleBusy = l.id;
		try {
			const res = await fetch('/api/admin/levels', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ levelId: l.id, published: !l.published })
			});
			if (!res.ok) return;
			l.published = l.published ? 0 : 1;
		} finally {
			toggleBusy = null;
		}
	}

	async function load() {
		if (data.forbidden) {
			loading = false;
			return;
		}
		loading = true;
		try {
			const res = await fetch(`/api/admin/levels?q=${encodeURIComponent(q)}&limit=${PAGE}&offset=0`, { credentials: 'same-origin' });
			const j = await res.json();
			if (!res.ok) throw new Error(j.error ?? 'Lista nem tölthető.');
			items = j.items ?? [];
			total = j.total ?? 0;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loading = false;
		}
	}

	async function loadMore() {
		if (moreBusy || items.length >= total) return;
		moreBusy = true;
		try {
			const res = await fetch(`/api/admin/levels?q=${encodeURIComponent(q)}&limit=${PAGE}&offset=${items.length}`, { credentials: 'same-origin' });
			if (res.ok) {
				const j = await res.json();
				items = [...items, ...(j.items ?? [])];
				total = j.total ?? total;
			}
		} finally {
			moreBusy = false;
		}
	}

	let timer: ReturnType<typeof setTimeout>;
	function schedule(v: string) {
		q = v;
		clearTimeout(timer);
		timer = setTimeout(() => void load(), 350);
	}

	onMount(() => void load());
</script>

<svelte:head>
	<title>Tananyag admin | Leardy</title>
</svelte:head>

{#if data.forbidden}
	<div class="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
		<p class="font-bold text-ink-900 dark:text-white">Nincs jogosultságod ehhez az oldalhoz</p>
		<p class="mt-1 text-sm text-stone-500">Admin vagy fejlesztői szerep kell.</p>
	</div>
{:else}
<p class="text-[13px] leading-relaxed text-stone-500">
	Adminként minden tananyagot megnyithatsz a szerkesztőben, tulajdonostól függetlenül. A mentés ugyanazt a felületet használja, mint a tanári szerkesztő.
</p>

<input
	type="search"
	placeholder="Keresés tananyag vagy tantárgy alapján"
	value={q}
	oninput={(e) => schedule((e.target as HTMLInputElement).value)}
	aria-label="Tananyag keresése"
	class="mt-3 w-full rounded-full border border-stone-200 bg-white px-4 py-2.5 text-[14px] outline-none focus:border-brand-500 dark:border-white/10 dark:bg-stone-900"
/>

{#if loading}
	<p class="mt-3 text-sm text-stone-500">Betöltés…</p>
{:else if error}
	<p class="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
{:else}
	<ul class="mt-2 grid gap-2">
		{#each items as l (l.id)}
			<li class="flex items-center gap-2.5 rounded-2xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-stone-900">
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[14px] font-bold">{l.title}</span>
					<span class="block truncate text-[12px] text-stone-500">
						{l.subject_title} · {l.lesson_count} lecke · {l.published ? 'publikált' : 'vázlat'}{l.owner_email ? ` · ${l.owner_email}` : ''}
					</span>
				</span>
				<button
					type="button"
					onclick={() => void togglePublish(l)}
					disabled={toggleBusy === l.id}
					aria-pressed={!!l.published}
					class={['shrink-0 rounded-full px-3.5 py-2 text-[12px] font-bold transition active:scale-95 disabled:opacity-50', l.published ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-stone-100 text-stone-500 dark:bg-white/10']}
				>
					{toggleBusy === l.id ? '…' : l.published ? 'Publikus' : 'Vázlat'}
				</button>
				<a
					href={`/tanulas/szerkeszto?subject=${encodeURIComponent(l.subject_id)}&level=${encodeURIComponent(l.id)}`}
					class="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-[13px] font-bold text-white"
				>
					Megnyitás
				</a>
			</li>
		{/each}
	</ul>
	{#if items.length === 0}
		<p class="mt-3 rounded-2xl bg-stone-100 p-4 text-center text-[13px] text-stone-500">Nincs találat.</p>
	{/if}
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
{/if}

{/if}

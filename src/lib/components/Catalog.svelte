<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ArrowLeft, BookOpenText, Layers, Plus, Search, SlidersHorizontal } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import { get as cacheGet, invalidate, peek } from '$lib/cache';
	import { CATEGORIES, studyApi, type Topic } from '$lib/study';

	interface Props {
		mode: 'mine' | 'new';
		title: string;
		/** Felfedezés-oldalon: vissza-nyíl, ikon-szűrő, nincs + gomb. */
		showBack?: boolean;
	}

	let { mode, title, showBack = false }: Props = $props();

	let q = $state('');
	let debounced = $state('');
	let cat = $state<string>('Mind');
	let filterOpen = $state(false);

	let topics = $state<Topic[]>([]);
	let err = $state<string | null>(null);

	let nTitle = $state('');
	let nCat = $state<string>('Angol');
	let busy = $state(false);
	let newOpen = $state(false);
	let deckOnly = $state(false);

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	function cacheKey(): string {
		const p = new URLSearchParams({ tab: mode });
		if (cat !== 'Mind') p.set('category', cat);
		if (debounced.trim()) p.set('q', debounced.trim());
		return `topics:${p.toString()}`;
	}

	async function load() {
		if (mode === 'mine' && !auth.user) {
			topics = [];
			return;
		}
		err = null;
		try {
			const key = cacheKey();
			const p = new URLSearchParams();
			if (cat !== 'Mind') p.set('category', cat);
			if (debounced.trim()) p.set('q', debounced.trim());
			p.set('enrolled', mode === 'mine' ? 'only' : 'new');
			const res = await cacheGet(key, () => studyApi.topics(`?${p.toString()}`), 60000);
			topics = res.data.topics;
		} catch (e) {
			if (topics.length === 0) err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	onMount(() => {
		topics = peek<{ topics: Topic[] }>(cacheKey())?.topics ?? [];
		void load();
	});

	$effect(() => {
		void mode;
		void cat;
		void auth.user;
		topics = peek<{ topics: Topic[] }>(cacheKey())?.topics ?? [];
		void load();
	});

	$effect(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
		const v = q;
		debounceTimer = setTimeout(() => {
			debounced = v;
		}, 300);
		return () => {
			if (debounceTimer) clearTimeout(debounceTimer);
		};
	});

	$effect(() => {
		void debounced;
		topics = peek<{ topics: Topic[] }>(cacheKey())?.topics ?? [];
		void load();
	});

	let filtered = $derived(cat !== 'Mind' ? 1 : 0);

	async function create() {
		if (!auth.user) {
			authUI.show('login');
			return;
		}
		if (!nTitle.trim() || busy) return;
		busy = true;
		try {
			if (deckOnly) {
				const d = await studyApi.createDeck({ title: nTitle.trim(), category: nCat });
				nTitle = '';
				deckOnly = false;
				newOpen = false;
				invalidate('topics');
				await goto(`/temakorok/${d.topic_id}?szerkeszt=1`);
				return;
			}
			const res = await fetch('/api/topics', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: nTitle.trim(), category: nCat })
			});
			const data = (await res.json().catch(() => ({}))) as { error?: string; topic?: Topic };
			if (!res.ok) throw new Error(data.error ?? 'Hiba történt.');
			nTitle = '';
			newOpen = false;
			invalidate('topics');
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}
</script>

{#if showBack}
	<div class="mt-3 flex items-center gap-2">
		<a
			href="/temakorok"
			aria-label="Vissza a témakörökhöz"
			class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-900 transition hover:bg-stone-50 active:scale-95 dark:border-white/10 dark:bg-stone-900 dark:text-white"
		>
			<ArrowLeft size={20} />
		</a>
		<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">{title}</h1>
		<span class="shrink-0 text-[13px] font-medium text-stone-500 tabular-nums dark:text-stone-400">{topics.length} db</span>
	</div>

	<div class="mt-3 flex gap-2">
		<div class="relative min-w-0 flex-1">
			<Search size={18} class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-stone-400" />
			<input
				bind:value={q}
				type="search"
				placeholder="Keresés…"
				autocomplete="off"
				aria-label="Keresés"
				class="w-full rounded-full border border-stone-200 bg-white py-3 pr-4 pl-11 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-stone-900 dark:text-white"
			/>
		</div>
		<button
			onclick={() => (filterOpen = true)}
			aria-label="Szűrő"
			class="relative grid size-[52px] shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-600 transition hover:bg-stone-50 active:scale-95 dark:border-white/10 dark:bg-stone-900 dark:text-stone-300"
		>
			<SlidersHorizontal size={20} />
			{#if filtered > 0}
				<span class="absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-brand-500 text-[11px] font-extrabold text-white">
					{filtered}
				</span>
			{/if}
		</button>
	</div>
{:else}
	<div class="mt-3 flex items-center justify-between gap-3">
		<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">{title}</h1>
		<span class="text-[13px] font-medium text-stone-500 tabular-nums dark:text-stone-400">{topics.length} db</span>
	</div>

	<div class="relative mt-3">
		<Search size={18} class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-stone-400" />
		<input
			bind:value={q}
			type="search"
			placeholder="Keresés…"
			autocomplete="off"
			aria-label="Keresés"
			class="w-full rounded-full border border-stone-200 bg-white py-3 pr-4 pl-11 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-stone-900 dark:text-white"
		/>
	</div>

	<div class="mt-2 flex gap-2">
		<button
			onclick={() => (filterOpen = true)}
			class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:bg-stone-900 dark:text-stone-300"
		>
			<SlidersHorizontal size={16} />
			Szűrő
			{#if filtered > 0}
				<span class="grid size-5 place-items-center rounded-full bg-brand-500 text-[11px] font-extrabold text-white">
					{filtered}
				</span>
			{/if}
		</button>
		<a
			href="/felfedezes"
			class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.99] dark:bg-white dark:text-ink-900"
		>
			Felfedezés
		</a>
		<button
			onclick={() => {
				if (!auth.user) authUI.show('login');
				else newOpen = true;
			}}
			aria-label="Új témakör"
			class="grid size-[46px] shrink-0 place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 active:scale-95"
		>
			<Plus size={20} strokeWidth={2.5} />
		</button>
	</div>
{/if}

{#if err && topics.length === 0}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{/if}

<div class="mt-3 space-y-2.5">
	{#each topics as t (t.id)}
		<a
			href="/temakorok/{t.id}"
			class="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 transition hover:bg-stone-50 active:scale-[0.995] dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
		>
			<span class="grid size-11 shrink-0 place-items-center rounded-xl {t.type === 'language' ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white' : 'bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300'}">
				{#if t.type === 'language'}
					<BookOpenText size={22} />
				{:else}
					<Layers size={22} />
				{/if}
			</span>
			<span class="min-w-0 flex-1">
				<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{t.title}</span>
				<span class="mt-0.5 block text-[13px] text-ink-400 dark:text-stone-500">
					{t.category} · {t.lessons ?? 0} lecke · {t.cards ?? 0} kártya
				</span>
			</span>
		</a>
	{:else}
		{#if mode === 'mine' && !auth.user}
			<div class="rounded-2xl border border-stone-200 bg-white p-6 text-center dark:border-white/10 dark:bg-stone-900">
				<p class="text-[15px] font-bold text-ink-900 dark:text-white">Jelentkezz be a témaköreidhez</p>
				<button
					onclick={() => authUI.show('login')}
					class="mt-3 w-full rounded-full bg-brand-500 py-2.5 text-sm font-bold text-white"
				>
					Bejelentkezés
				</button>
			</div>
		{:else}
			<p class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">
				{mode === 'mine'
					? 'Még nem vettél fel témakört — nézz körül a Felfedezésben!'
					: 'Nincs találat. Próbálj másik keresést!'}
			</p>
		{/if}
	{/each}
</div>

<Drawer open={newOpen} label="Új témakör" onClose={() => (newOpen = false)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Új témakör</h2>
		<label class="mt-4 block text-[13px] font-semibold text-ink-900 dark:text-white" for="new-topic-title">Cím</label>
		<input
			id="new-topic-title"
			bind:value={nTitle}
			placeholder="Pl. Unit 4: Étterem"
			class="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
		/>
		<p class="mt-4 text-[13px] font-semibold text-ink-900 dark:text-white">Tantárgy</p>
		<div class="mt-2 flex flex-wrap gap-2">
			{#each CATEGORIES as c (c)}
				<button
					onclick={() => (nCat = c)}
					aria-pressed={nCat === c}
					class={['rounded-full px-4 py-2 text-sm font-semibold transition', nCat === c ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
				>
					{c}
				</button>
			{/each}
		</div>
		<div class="mt-5 flex items-center gap-3 rounded-2xl bg-stone-100 p-4 dark:bg-white/5">
			<div class="min-w-0 flex-1">
				<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Önálló pakli</p>
				<p class="text-[13px] text-ink-400 dark:text-stone-500">Csak kártyacsomag, témakör nélkül (privát)</p>
			</div>
			<Toggle bind:checked={deckOnly} label="Önálló pakli" />
		</div>
		<button
			onclick={create}
			disabled={busy || !nTitle.trim()}
			class="mt-4 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
		>
			{busy ? 'Létrehozás…' : deckOnly ? 'Pakli létrehozása' : 'Létrehozás'}
		</button>
	</div>
</Drawer>

<Drawer open={filterOpen} label="Szűrő" onClose={() => (filterOpen = false)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Szűrő</h2>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Tantárgy</p>
		<div class="mt-3 flex flex-wrap gap-2">
			<button
				onclick={() => (cat = 'Mind')}
				aria-pressed={cat === 'Mind'}
				class={['rounded-full px-4 py-2 text-sm font-semibold transition', cat === 'Mind' ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
			>
				Mind
			</button>
			{#each CATEGORIES as c (c)}
				<button
					onclick={() => (cat = c)}
					aria-pressed={cat === c}
					class={['rounded-full px-4 py-2 text-sm font-semibold transition', cat === c ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
				>
					{c}
				</button>
			{/each}
		</div>
		<button
			onclick={() => {
				cat = 'Mind';
				filterOpen = false;
			}}
			class="mt-4 w-full rounded-full border border-stone-200 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-stone-50 dark:border-white/10 dark:text-stone-300"
		>
			Szűrők törlése
		</button>
		<button
			onclick={() => (filterOpen = false)}
			class="mt-2 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600"
		>
			Kész ({topics.length} találat)
		</button>
	</div>
</Drawer>

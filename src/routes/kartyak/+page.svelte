<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ChevronRight, Layers, Plus } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { get as cacheGet, invalidate, peek } from '$lib/cache';
	import { CATEGORIES, studyApi, type MyTopic } from '$lib/study';

	let user = $derived(auth.user);
	let isTeacher = $derived((user?.role ?? 'student') === 'teacher');

	let topics = $state<MyTopic[]>([]);
	let cardCounts = $state<Record<string, number>>({});
	let err = $state<string | null>(null);

	// Új csomag drawer
	let packOpen = $state(false);
	let packTitle = $state('');
	let packCat = $state<string>('');
	let packBusy = $state(false);

	async function load() {
		if (!isTeacher) return;
		err = null;
		try {
			const res = await cacheGet('mycards', () => studyApi.myCards(), 30000);
			topics = res.data.topics;
			const counts: Record<string, number> = {};
			for (const c of res.data.cards) counts[c.topic_id] = (counts[c.topic_id] ?? 0) + 1;
			cardCounts = counts;
		} catch (e) {
			if (topics.length === 0) err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	onMount(() => {
		const c = peek<{ topics: MyTopic[] }>('mycards');
		if (c) topics = c.topics;
		void load();
	});

	$effect(() => {
		void auth.user;
		void load();
	});

	async function createPack() {
		if (!packTitle.trim() || packBusy) return;
		packBusy = true;
		try {
			const d = await studyApi.createDeck({ title: packTitle.trim(), category: packCat });
			packTitle = '';
			packCat = '';
			packOpen = false;
			invalidate('mycards');
			await goto(`/kartyak/${d.topic_id}`);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			packBusy = false;
		}
	}
</script>

<svelte:head>
	<title>Kártyák — Leardy</title>
</svelte:head>

<div class="mt-3 flex items-center gap-2">
	<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Kártyák</h1>
	{#if isTeacher}
		<button
			onclick={() => {
				err = null;
				packOpen = true;
			}}
			aria-label="Új kártyacsomag"
			class="grid size-10 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 active:scale-95"
		>
			<Plus size={20} strokeWidth={2.5} />
		</button>
	{/if}
</div>

{#if !user}
	<button
		onclick={() => authUI.show('login')}
		class="mt-3 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white"
	>
		Bejelentkezés
	</button>
{:else if !isTeacher}
	<section class="mt-3 rounded-[24px] border border-stone-200 bg-white p-8 text-center dark:border-white/10 dark:bg-stone-900">
		<p class="text-[16px] font-bold text-ink-900 dark:text-white">Ez tanári felület</p>
		<p class="mx-auto mt-1 max-w-xs text-sm text-stone-500 dark:text-stone-400">
			Kapcsold be a Tanár módot a Beállítások → Fejlesztői beállítások alatt.
		</p>
		<a href="/beallitasok" class="mt-4 inline-block rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-white">
			Beállítások
		</a>
	</section>
{:else}
	{#if err}
		<p role="alert" class="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
	{/if}

	<div class="mt-3 space-y-2.5">
		{#each topics as t, i (t.id)}
			<a
				href="/kartyak/{t.id}"
				style="--d:{Math.min(i * 45, 270)}ms"
				class="anim-rise flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 transition hover:bg-stone-50 active:scale-[0.995] dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
			>
				<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
					<Layers size={22} />
				</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{t.title}</span>
					<span class="block truncate text-[13px] text-stone-500 tabular-nums dark:text-stone-400">
						{t.category ? `${t.category} · ` : ''}{cardCounts[t.id] ?? 0} kártya · {t.is_public === 1 ? 'nyilvános' : 'privát'}
					</span>
				</span>
				<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
			</a>
		{:else}
			<p class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">
				Még nincs kártyacsomagod. Hozz létre egyet a + gombbal!
			</p>
		{/each}
	</div>
{/if}

<!-- Új csomag drawer: csak alapadatok, utána a részletező nyílik -->
<Drawer open={packOpen} label="Új kártyacsomag" onClose={() => (packOpen = false)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Új kártyacsomag</h2>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Témakör nélkül, csak kártyák.</p>
		<label class="mt-4 block text-[13px] font-semibold text-ink-900 dark:text-white" for="pack-title">Cím</label>
		<input
			id="pack-title"
			bind:value={packTitle}
			placeholder="Pl. Unit 4 szavak"
			class="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
		/>
		<p class="mt-4 text-[13px] font-semibold text-ink-900 dark:text-white">Tantárgy <span class="font-normal text-stone-400">(opcionális)</span></p>
		<div class="mt-2 flex flex-wrap gap-2">
			<button
				onclick={() => (packCat = '')}
				aria-pressed={packCat === ''}
				class={['rounded-full px-4 py-2 text-sm font-semibold transition', packCat === '' ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
			>
				Nincs
			</button>
			{#each CATEGORIES as c (c)}
				<button
					onclick={() => (packCat = c)}
					aria-pressed={packCat === c}
					class={['rounded-full px-4 py-2 text-sm font-semibold transition', packCat === c ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
				>
					{c}
				</button>
			{/each}
		</div>
		<button
			onclick={() => void createPack()}
			disabled={packBusy || !packTitle.trim()}
			class="mt-4 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
		>
			{packBusy ? 'Létrehozás…' : 'Létrehozás és megnyitás'}
		</button>
	</div>
</Drawer>

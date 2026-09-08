<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import FlashcardPlayer from '$lib/components/FlashcardPlayer.svelte';
	import { studyApi, type ReviewCard, type ReviewFilter } from '$lib/study';

	const FILTERS: { id: ReviewFilter; label: string }[] = [
		{ id: 'mind', label: 'Mind' },
		{ id: 'language', label: 'Nyelvek' },
		{ id: 'general', label: 'Tantárgyak' }
	];

	let filter = $state<ReviewFilter>('mind');
	let cram = $state(false);
	let queue = $state<ReviewCard[]>([]);
	let idx = $state(0);
	let knownOnce = $state<Set<string>>(new Set());
	let loading = $state(true);
	let err = $state<string | null>(null);
	let graded = $state(0);

	let card = $derived(queue[idx]);
	let isLang = $derived(card?.topic_type === 'language');

	async function load() {
		if (!auth.user) {
			loading = false;
			return;
		}
		loading = true;
		err = null;
		try {
			queue = (await studyApi.due(filter)).cards;
			idx = 0;
			knownOnce = new Set();
			graded = 0;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loading = false;
		}
	}

	onMount(load);
	$effect(() => {
		void filter;
		void auth.user;
		load();
	});

	async function grade(known: boolean) {
		const c = queue[idx];
		if (!c) return;
		graded++;
		try {
			await studyApi.grade(c.id, known, cram);
			await auth.refresh();
		} catch {
			// helyben folytatjuk
		}
		if (cram) {
			// Magolás: addig pörög, amíg minden kártyára egyszer "Tudom" nem jön.
			if (known) knownOnce.add(c.id);
			const rest = queue.filter((x) => !knownOnce.has(x.id) || x.id === c.id);
			if (knownOnce.size >= queue.length && known) {
				idx = queue.length; // kész
				return;
			}
			if (!known) {
				queue.push(c);
			}
			idx++;
			void rest;
		} else {
			// SRS: a "Nem tudom" a menet végére pörög vissza.
			if (!known) queue.push(c);
			idx++;
		}
	}

	let finished = $derived(!loading && queue.length > 0 && idx >= queue.length);
</script>

<svelte:head>
	<title>Gyakorlás — Leardy</title>
</svelte:head>

<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Gyakorlás</h1>
			<p class="text-sm text-ink-600 dark:text-stone-400">
				{cram ? 'Magolás: az SRS-időzítést figyelmen kívül hagyjuk.' : 'Napi ismétlések az összes tanult témakörből (SRS).'}
			</p>
		</div>
		<button
			onclick={() => (cram = !cram)}
			aria-pressed={cram}
			class={['rounded-full px-4 py-2 text-sm font-semibold transition', cram ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-stone-100 text-ink-600 hover:bg-stone-200 dark:bg-white/10 dark:text-stone-300']}
		>
			{cram ? 'Magolás be' : 'Magolás ki'}
		</button>
	</div>
	<div class="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Szűrő">
		{#each FILTERS as f (f.id)}
			<button
				role="tab"
				aria-selected={filter === f.id}
				onclick={() => (filter = f.id)}
				class={['rounded-full px-4 py-2 text-sm font-semibold transition', filter === f.id ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 hover:bg-stone-200 dark:bg-white/10 dark:text-stone-300']}
			>
				{f.label}
			</button>
		{/each}
	</div>
</section>

{#if !auth.user}
	<section class="mt-3 rounded-[24px] border border-stone-200 bg-white p-8 text-center dark:border-white/10 dark:bg-stone-900">
		<h2 class="font-display text-[22px] font-bold tracking-tight text-ink-900 dark:text-white">A gyakorlás fiókhoz kötött</h2>
		<p class="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-stone-500 dark:text-stone-400">
			Jelentkezz be, hogy az ismétléseid és a szériád megmaradjon.
		</p>
		<button
			onclick={() => authUI.show('login')}
			class="mt-5 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99]"
		>
			Bejelentkezés
		</button>
	</section>
{:else if loading}
	<p class="mt-4 text-sm text-stone-500 dark:text-stone-400">Kártyák betöltése…</p>
{:else if err}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else if queue.length === 0}
	<section class="mt-3 rounded-2xl border border-dashed border-stone-300 p-6 text-center dark:border-white/15">
		<p class="text-[16px] font-bold text-ink-900 dark:text-white">Ma nincs esedékes ismétlés 🎉</p>
		<p class="mx-auto mt-1 max-w-xs text-sm text-stone-500 dark:text-stone-400">
			Vegyél fel új témakört a könyvtárból, vagy magolj rá a holnapi dogára.
		</p>
		<a href="/temakorok" class="mt-4 inline-block rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600">
			Témakörök böngészése
		</a>
	</section>
{:else if finished}
	<section class="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
		<p class="text-[18px] font-extrabold text-emerald-800 dark:text-emerald-200">Kész a mai adag! ({graded} értékelés)</p>
		<p class="mt-1 text-sm text-emerald-700 dark:text-emerald-300">A „Tudom" kártyák intervalluma nőtt: 1 → 3 → 7 → 14 → 30 nap.</p>
		<button
			onclick={load}
			class="mt-4 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
		>
			Frissítés
		</button>
	</section>
{:else if card}
	<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<div class="mb-2 flex items-center justify-between gap-2">
			<p class="truncate text-xs font-semibold text-ink-400 dark:text-stone-500">
				{card.topic_title} · {idx + 1} / {queue.length}
			</p>
			<span class="shrink-0 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-500 dark:bg-white/10 dark:text-stone-300">
				{card.topic_type === 'language' ? 'Nyelvi' : 'Tantárgyi'}
			</span>
		</div>
		{#key card.id + '-' + idx}
			<FlashcardPlayer card={card} isLanguage={isLang} onGrade={grade} />
		{/key}
	</section>
{/if}

<script lang="ts">
	import { onMount } from 'svelte';
	import { BookOpenText, Check, Layers, Plus } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import { studyApi, type Topic } from '$lib/study';

	const CATS = ['Mind', 'Nyelv', 'Reál', 'Humán'] as const;
	const TYPES = [
		{ id: '', label: 'Mind' },
		{ id: 'language', label: 'Nyelvek' },
		{ id: 'general', label: 'Tantárgyak' }
	] as const;

	let cat = $state<(typeof CATS)[number]>('Mind');
	let type = $state<string>('');
	let topics = $state<Topic[]>([]);
	let loading = $state(true);
	let err = $state<string | null>(null);
	let showNew = $state(false);
	let nTitle = $state('');
	let nCat = $state('Humán');
	let nType = $state('general');
	let nPublic = $state(true);
	let busy = $state(false);

	async function load() {
		loading = true;
		err = null;
		try {
			const q = new URLSearchParams();
			if (cat !== 'Mind') q.set('category', cat);
			if (type) q.set('type', type);
			const qs = q.toString();
			topics = (await studyApi.topics(qs ? `?${qs}` : '')).topics;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loading = false;
		}
	}

	onMount(load);
	$effect(() => {
		void cat;
		void type;
		void auth.user;
		load();
	});

	async function enroll(t: Topic) {
		if (!auth.user) {
			authUI.show('login');
			return;
		}
		try {
			await studyApi.enroll(t.id);
			t.enrolled = 1;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function create() {
		if (!auth.user) {
			authUI.show('login');
			return;
		}
		if (busy) return;
		busy = true;
		try {
			await studyApi.topics('').catch(() => null);
			const res = await fetch('/api/topics', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: nTitle, category: nCat, type: nType, is_public: nPublic })
			});
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			if (!res.ok) throw new Error(data.error ?? 'Hiba történt.');
			nTitle = '';
			showNew = false;
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	function typeLabel(t: Topic): string {
		return t.type === 'language' ? 'Nyelvi' : 'Tantárgyi';
	}
</script>

<svelte:head>
	<title>Témakörök — Leardy</title>
</svelte:head>

<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Témakörök</h1>
			<p class="text-sm text-ink-600 dark:text-stone-400">Nyilvános és saját témakörök — nyelv és tantárgy együtt.</p>
		</div>
		<button
			onclick={() => (showNew = !showNew)}
			class="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
		>
			<Plus size={15} strokeWidth={2.5} /> Új témakör
		</button>
	</div>
	{#if showNew}
		<div class="mt-4 grid gap-2.5 rounded-2xl bg-stone-100 p-4 sm:grid-cols-2 dark:bg-white/5">
			<input
				bind:value={nTitle}
				placeholder="Cím (pl. Unit 4: Étterem)"
				class="rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none focus:border-brand-500 sm:col-span-2 dark:border-white/15 dark:bg-white/5 dark:text-white"
			/>
			<select bind:value={nCat} class="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-white/5 dark:text-white">
				<option value="Nyelv">Nyelv</option>
				<option value="Reál">Reál</option>
				<option value="Humán">Humán</option>
			</select>
			<select bind:value={nType} class="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-white/5 dark:text-white">
				<option value="language">Nyelvi (audió + kiejtés)</option>
				<option value="general">Tantárgyi (vizuális feladatok)</option>
			</select>
			<button
				onclick={create}
				disabled={busy}
				class="rounded-full bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 sm:col-span-2 dark:bg-white dark:text-ink-900"
			>
				{busy ? 'Létrehozás…' : 'Létrehozás'}
			</button>
		</div>
	{/if}
	<div class="mt-4 flex flex-wrap gap-2">
		{#each CATS as c (c)}
			<button
				onclick={() => (cat = c)}
				aria-pressed={cat === c}
				class={['rounded-full px-4 py-2 text-sm font-semibold transition', cat === c ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 hover:bg-stone-200 dark:bg-white/10 dark:text-stone-300']}
			>
				{c === 'Nyelv' ? 'Nyelvek' : c}
			</button>
		{/each}
	</div>
	<div class="mt-2 flex flex-wrap gap-2">
		{#each TYPES as t (t.id)}
			<button
				onclick={() => (type = t.id)}
				aria-pressed={type === t.id}
				class={['rounded-full border px-4 py-1.5 text-[13px] font-semibold transition', type === t.id ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-white' : 'border-stone-200 text-stone-500 dark:border-white/10 dark:text-stone-400']}
			>
				{t.label}
			</button>
		{/each}
	</div>
</section>

{#if err}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{/if}

{#if loading}
	<p class="mt-4 text-sm text-stone-500 dark:text-stone-400">Betöltés…</p>
{:else}
	<div class="mt-3 space-y-3">
		{#each topics as t (t.id)}
			<article class="rounded-2xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-stone-900">
				<div class="flex items-start gap-3.5">
					<span class="grid size-11 shrink-0 place-items-center rounded-xl {t.type === 'language' ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white' : 'bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300'}">
						{#if t.type === 'language'}
							<BookOpenText size={22} />
						{:else}
							<Layers size={22} />
						{/if}
					</span>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-[16px] font-bold text-ink-900 dark:text-white">{t.title}</h2>
							<span class="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-500 dark:bg-white/10 dark:text-stone-300">
								{t.category} · {typeLabel(t)}
							</span>
						</div>
						<p class="mt-0.5 text-[13px] text-ink-400 dark:text-stone-500">
							{t.lessons ?? 0} lecke · {t.cards ?? 0} kártya
						</p>
					</div>
				</div>
				<div class="mt-4 flex gap-2">
					<a
						href="/temakorok/{t.id}"
						class="flex-1 rounded-full bg-brand-500 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-brand-600"
					>
						Megnyitás
					</a>
					{#if t.enrolled}
						<span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
							<Check size={15} strokeWidth={3} /> Felvéve
						</span>
					{:else}
						<button
							onclick={() => enroll(t)}
							class="rounded-full border border-stone-200 px-4 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-stone-50 dark:border-white/10 dark:text-stone-300 dark:hover:bg-white/5"
						>
							+ Felveszem
						</button>
					{/if}
				</div>
			</article>
		{:else}
			<p class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">
				Itt még nincs témakör. Hozz létre egyet fent!
			</p>
		{/each}
	</div>
{/if}

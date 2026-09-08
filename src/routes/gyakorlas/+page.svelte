<script lang="ts">
	import { onMount } from 'svelte';
	import { ListFilter, Play, Plus, Trash2 } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { invalidate } from '$lib/cache';
	import { player } from '$lib/player.svelte';
	import { CATEGORIES, studyApi, type ReviewCard } from '$lib/study';

	// Preset = mentett tantárgy-válogatás. Az új leckék automatikusan bekerülnek,
	// mert a szűrés kategória alapján megy, nem fix lecke-listával.
	interface Preset {
		id: string;
		name: string;
		categories: string[];
	}

	const PRESETS_KEY = 'leardy-presets-v1';

	let presets = $state<Preset[]>([]);
	let activeId = $state<string | null>(null);
	let cram = $state(false);
	let queue = $state<ReviewCard[]>([]);
	let loading = $state(true);
	let err = $state<string | null>(null);

	let managerOpen = $state(false);
	let pName = $state('');
	let pCats = $state<string[]>([]);
	let extraLoading = $state(false);

	function readPresets(): { presets: Preset[]; activeId: string | null } {
		const fallback: Preset[] = [
			{ id: 'preset-angol', name: 'Angol', categories: ['Angol'] },
			{ id: 'preset-nemet', name: 'Német', categories: ['Német'] }
		];
		try {
			const raw = localStorage.getItem(PRESETS_KEY);
			if (!raw) return { presets: fallback, activeId: null };
			const p: unknown = JSON.parse(raw);
			if (p && typeof p === 'object' && Array.isArray((p as { presets?: unknown }).presets)) {
				const list = ((p as { presets: Preset[] }).presets ?? []).filter(
					(x) => x && typeof x.name === 'string' && Array.isArray(x.categories) && x.categories.length > 0
				);
				const act = (p as { activeId?: unknown }).activeId;
				return {
					presets: list,
					activeId: typeof act === 'string' && list.some((x) => x.id === act) ? act : null
				};
			}
		} catch {
			// sérült mentés
		}
		return { presets: fallback, activeId: null };
	}

	function writePresets() {
		try {
			localStorage.setItem(PRESETS_KEY, JSON.stringify({ presets, activeId }));
		} catch {
			// tiltott storage: csak a munkamenetben él
		}
	}

	let active = $derived(presets.find((p) => p.id === activeId) ?? null);

	async function loadQueue() {
		if (!auth.user) {
			loading = false;
			return;
		}
		loading = true;
		err = null;
		try {
			queue = (
				await studyApi.due('mind', 50, active ? { categories: active.categories } : undefined)
			).cards;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		const saved = readPresets();
		presets = saved.presets;
		activeId = saved.activeId;
		await loadQueue();
	});

	$effect(() => {
		void auth.user;
		void activeId;
		void loadQueue();
	});

	function toggleCat(c: string) {
		pCats = pCats.includes(c) ? pCats.filter((x) => x !== c) : [...pCats, c];
	}

	function savePreset() {
		const name = pName.trim();
		if (name.length < 2 || pCats.length === 0) return;
		let id = '';
		try {
			id = crypto.randomUUID();
		} catch {
			id = `p-${Date.now().toString(36)}`;
		}
		presets = [...presets, { id, name, categories: [...pCats] }];
		activeId = id;
		pName = '';
		pCats = [];
		writePresets();
		managerOpen = false;
	}

	function deletePreset(id: string) {
		presets = presets.filter((p) => p.id !== id);
		if (activeId === id) activeId = null;
		writePresets();
	}

	function start() {
		if (queue.length === 0) return;
		player.openCards({
			title: 'Gyakorlás',
			subtitle: active?.name ?? 'Ismétlés',
			cards: queue,
			isLanguage: 'auto',
			repeatUnknown: true,
			untilAllKnown: cram,
			onGrade: async (card, known) => {
				try {
					await studyApi.grade(card.id, known, cram);
					invalidate('stats');
					await auth.refresh();
				} catch {
					// helyben folytatjuk
				}
			},
			onFinish: async () => {
				await loadQueue();
			}
		});
	}

	/** Ráadás, ha elfogytak az esedékesek: leggyengébb nyelviek + legfrissebb tantárgyiak. */
	async function startExtra() {
		if (extraLoading) return;
		extraLoading = true;
		try {
			const extra = (
				await studyApi.due('mind', 30, active ? { categories: active.categories, extra: true } : { extra: true })
			).cards;
			if (extra.length === 0) return;
			player.openCards({
				title: 'Ráadás gyakorlás',
				subtitle: active?.name ?? 'Ismétlésen felül',
				cards: extra,
				isLanguage: 'auto',
				repeatUnknown: true,
				untilAllKnown: false,
				onGrade: async (card, known) => {
					try {
						await studyApi.grade(card.id, known, false);
						invalidate('stats');
						await auth.refresh();
					} catch {
						// helyben folytatjuk
					}
				},
				onFinish: async () => {
					await loadQueue();
				}
			});
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			extraLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Gyakorlás — Leardy</title>
</svelte:head>

{#if (auth.user?.role ?? 'student') === 'teacher'}
	<h1 class="mt-3 text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Gyakorlás</h1>
	<section class="mt-3 rounded-[24px] border border-stone-200 bg-white p-8 text-center dark:border-white/10 dark:bg-stone-900">
		<h2 class="font-display text-[22px] font-bold tracking-tight text-ink-900 dark:text-white">Tanárként nincs gyakorlás</h2>
		<p class="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-stone-500 dark:text-stone-400">
			A kvízeidet és kártyáidat a tanári felületen találod.
		</p>
		<div class="mt-5 grid grid-cols-2 gap-2">
			<a href="/kvizek" class="rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white">Kvízeim</a>
			<a href="/kartyak" class="rounded-full border border-stone-200 py-3 text-[15px] font-bold text-ink-900 dark:border-white/10 dark:text-white">Kártyáim</a>
		</div>
	</section>
{:else}
<div class="mt-3 flex items-center justify-between gap-2">
	<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Gyakorlás</h1>
	<div class="flex items-center gap-2">
		<button
			onclick={() => (cram = !cram)}
			aria-pressed={cram}
			class={['rounded-full px-4 py-2 text-sm font-semibold transition', cram ? 'bg-amber-500 text-white' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
		>
			Magolás
		</button>
		<button
			onclick={() => (managerOpen = true)}
			aria-label="Presetek"
			class="relative grid size-[42px] place-items-center rounded-full border border-stone-200 bg-white text-ink-600 transition hover:bg-stone-50 dark:hover:bg-white/10 active:scale-95 dark:border-white/10 dark:bg-stone-900 dark:text-stone-300"
		>
			<ListFilter size={19} />
			{#if active}
				<span class="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-brand-500"></span>
			{/if}
		</button>
	</div>
</div>

<div class="mt-2 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Presetek">
	<button
		role="tab"
		aria-selected={active === null}
		onclick={() => {
			activeId = null;
			writePresets();
		}}
		class={['shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition', active === null ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
	>
		Mind
	</button>
	{#each presets as p (p.id)}
		<button
			role="tab"
			aria-selected={activeId === p.id}
			onclick={() => {
				activeId = p.id;
				writePresets();
			}}
			title={p.categories.join(', ')}
			class={['shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition', activeId === p.id ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
		>
			{p.name}
		</button>
	{/each}
	<button
		onclick={() => (managerOpen = true)}
		aria-label="Új preset"
		class="grid size-[38px] shrink-0 place-items-center self-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 active:scale-95"
	>
		<Plus size={18} strokeWidth={2.5} />
	</button>
</div>

{#if !auth.user}
	<button
		onclick={() => authUI.show('login')}
		class="mt-3 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white"
	>
		Bejelentkezés
	</button>
{:else if loading && queue.length === 0}
	<p class="animate-pulse mt-6 text-center text-sm text-stone-400">…</p>
{:else if err && queue.length === 0}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else if queue.length === 0}
	<p class="mt-6 text-center text-[15px] font-bold text-ink-900 dark:text-white">Nincs esedékes kártya 🎉</p>
	<button
		onclick={() => void startExtra()}
		disabled={extraLoading}
		class="mt-3 block w-full rounded-[28px] border-2 border-dashed border-stone-300 p-6 text-center transition hover:border-emerald-500 active:scale-[0.99] disabled:opacity-60 dark:border-white/15 dark:hover:border-emerald-400"
	>
		<span class="block text-[15px] font-bold text-ink-900 dark:text-white">
			{extraLoading ? 'Összeállítás…' : 'Mégis gyakorlok'}
		</span>
		<span class="mt-0.5 block text-[13px] text-stone-500 dark:text-stone-400">
			nyelvből a leggyengébbek, másból a legfrissebb leckék
		</span>
	</button>
{:else}
	<button
		onclick={start}
		class="mt-3 block w-full rounded-[28px] bg-emerald-500 p-8 text-center text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-600 active:scale-[0.99]"
	>
		<span class="font-display block text-[56px] leading-none font-extrabold tabular-nums">{queue.length}</span>
		<span class="mt-1 block text-[13px] font-semibold text-white/80">{active?.name ?? 'Mind'}{cram ? ' · magolás' : ''}</span>
		<span class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-5 py-2.5 text-[15px] font-bold">
			<Play size={17} fill="currentColor" /> Indítás
		</span>
	</button>
{/if}

<Drawer open={managerOpen} label="Presetek" onClose={() => (managerOpen = false)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Presetek</h2>
		<div class="mt-3 space-y-2">
			{#each presets as p (p.id)}
				<div class="flex items-center gap-2 rounded-2xl border border-stone-200 p-3 dark:border-white/10">
					<button
						onclick={() => {
							activeId = p.id;
							writePresets();
							managerOpen = false;
						}}
						class="min-w-0 flex-1 text-left"
					>
						<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{p.name}</span>
						<span class="block truncate text-[13px] text-stone-500 dark:text-stone-400">{p.categories.join(', ')}</span>
					</button>
					<button
						onclick={() => deletePreset(p.id)}
						aria-label="{p.name} törlése"
						class="grid size-8 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-400/10 dark:hover:text-red-300"
					>
						<Trash2 size={16} />
					</button>
				</div>
			{:else}
				<p class="text-sm text-stone-500 dark:text-stone-400">Még nincs preset — hozz létre egyet!</p>
			{/each}
		</div>
		<div class="mt-4 rounded-2xl bg-stone-100 p-4 dark:bg-white/5">
			<p class="text-sm font-bold text-ink-900 dark:text-white">Új preset</p>
			<input
				bind:value={pName}
				placeholder="Neve (pl. Matek)"
				aria-label="Preset neve"
				class="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
			/>
			<div class="mt-2 flex flex-wrap gap-1.5">
				{#each CATEGORIES as c (c)}
					<button
						onclick={() => toggleCat(c)}
						aria-pressed={pCats.includes(c)}
						class={['rounded-full px-3 py-1.5 text-[13px] font-semibold transition', pCats.includes(c) ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-white text-ink-600 dark:bg-white/10 dark:text-stone-300']}
					>
						{c}
					</button>
				{/each}
			</div>
			<button
				onclick={savePreset}
				disabled={pName.trim().length < 2 || pCats.length === 0}
				class="mt-3 w-full rounded-full bg-brand-500 py-2.5 text-sm font-bold text-white disabled:opacity-50"
			>
				Mentés
			</button>
		</div>
	</div>
</Drawer>
{/if}

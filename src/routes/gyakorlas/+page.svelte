<script lang="ts">
	import { onMount } from 'svelte';
	import { ChevronDown, ListFilter, Play } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { get as cacheGet, invalidate, peek } from '$lib/cache';
	import { player } from '$lib/player.svelte';
	import { studyApi, type PracticeSource, type ReviewCard, type ReviewFilter } from '$lib/study';

	const FILTERS: { id: ReviewFilter; label: string }[] = [
		{ id: 'mind', label: 'Mind' },
		{ id: 'language', label: 'Nyelvek' },
		{ id: 'general', label: 'Tantárgyak' }
	];

	let filter = $state<ReviewFilter>('mind');
	let cram = $state(false);
	let queue = $state<ReviewCard[]>([]);
	let loading = $state(true);
	let err = $state<string | null>(null);

	let sources = $state<PracticeSource[]>([]);
	let sourceOpen = $state(false);
	let selLessons = $state<string[]>([]);
	let expanded = $state<Record<string, boolean>>({});

	let lessonCount = $derived(sources.reduce((n, t) => n + t.lessons.length, 0));
	let scopeActive = $derived(selLessons.length > 0 && selLessons.length < lessonCount);

	async function loadSources() {
		try {
			const res = await cacheGet('sources', () => studyApi.sources(), 60000);
			sources = res.data.topics;
			const all: Record<string, boolean> = {};
			for (const t of sources) all[t.id] = true;
			expanded = all;
			const valid = new Set(sources.flatMap((t) => t.lessons.map((l) => l.id)));
			selLessons = selLessons.filter((id) => valid.has(id));
		} catch {
			// forráslista nélkül is megy (teljes merítés)
		}
	}

	async function loadQueue() {
		if (!auth.user) {
			loading = false;
			return;
		}
		loading = true;
		err = null;
		try {
			queue = (await studyApi.due(filter, 50, scopeActive ? { lessons: selLessons } : undefined)).cards;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		sources = peek<{ topics: PracticeSource[] }>('sources')?.topics ?? [];
		await loadSources();
		await loadQueue();
	});

	$effect(() => {
		void filter;
		void auth.user;
		void loadQueue();
	});

	function toggleLesson(id: string) {
		selLessons = selLessons.includes(id) ? selLessons.filter((x) => x !== id) : [...selLessons, id];
	}

	function toggleTopic(tid: string) {
		const t = sources.find((x) => x.id === tid);
		if (!t) return;
		const ids = t.lessons.map((l) => l.id);
		selLessons = ids.every((id) => selLessons.includes(id))
			? selLessons.filter((id) => !ids.includes(id))
			: [...new Set([...selLessons, ...ids])];
	}

	function topicChecked(tid: string): boolean | 'some' {
		const t = sources.find((x) => x.id === tid);
		if (!t || t.lessons.length === 0) return false;
		const n = t.lessons.filter((l) => selLessons.includes(l.id)).length;
		if (n === 0) return !scopeActive ? true : false;
		return n === t.lessons.length ? true : 'some';
	}

	function start() {
		if (queue.length === 0) return;
		player.openCards({
			title: 'Gyakorlás',
			subtitle: cram ? 'Magolás' : 'Ismétlés',
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
</script>

<svelte:head>
	<title>Gyakorlás — Leardy</title>
</svelte:head>

<div class="mt-3 flex items-center justify-between gap-3">
	<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Gyakorlás</h1>
	<button
		onclick={() => (cram = !cram)}
		aria-pressed={cram}
		class={['rounded-full px-4 py-2 text-sm font-semibold transition', cram ? 'bg-amber-500 text-white' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
	>
		Magolás
	</button>
</div>

<button
	onclick={() => (sourceOpen = true)}
	class="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-600 dark:border-white/10 dark:bg-stone-900 dark:text-stone-300"
>
	<ListFilter size={16} class="shrink-0" />
	<span class="truncate">{scopeActive ? `${selLessons.length} lecke` : 'Mind'}</span>
</button>

<div class="mt-2 flex gap-2" role="tablist" aria-label="Típus">
	{#each FILTERS as f (f.id)}
		<button
			role="tab"
			aria-selected={filter === f.id}
			onclick={() => (filter = f.id)}
			class={['flex-1 rounded-full px-3 py-2 text-sm font-semibold transition', filter === f.id ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
		>
			{f.label}
		</button>
	{/each}
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
	<div class="mt-3 flex gap-2">
		<button
			onclick={() => (sourceOpen = true)}
			class="flex-1 rounded-full border border-stone-300 px-4 py-2.5 text-sm font-semibold text-ink-600 dark:border-white/15 dark:text-stone-300"
		>
			Forrás
		</button>
		<a href="/temakorok" class="flex-1 rounded-full bg-brand-500 px-4 py-2.5 text-center text-sm font-semibold text-white">
			Témakörök
		</a>
	</div>
{:else}
	<button
		onclick={start}
		class="mt-3 block w-full rounded-[28px] bg-emerald-500 p-8 text-center text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-600 active:scale-[0.99]"
	>
		<span class="font-display block text-[56px] leading-none font-extrabold tabular-nums">{queue.length}</span>
		<span class="mt-2 inline-flex items-center gap-1.5 text-[15px] font-bold">
			<Play size={17} fill="currentColor" /> Indítás
		</span>
	</button>
{/if}

<Drawer open={sourceOpen} label="Forrás" onClose={() => (sourceOpen = false)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Forrás</h2>
		<button
			onclick={() => (selLessons = [])}
			class="mt-3 w-full rounded-full bg-stone-100 py-2 text-sm font-semibold text-ink-600 dark:bg-white/10 dark:text-stone-300"
		>
			Mind
		</button>
		<div class="mt-3 space-y-2.5">
			{#each sources as t (t.id)}
				{@const st = topicChecked(t.id)}
				<div class="rounded-2xl border border-stone-200 dark:border-white/10">
					<div class="flex items-center gap-1 p-2">
						<button
							onclick={() => toggleTopic(t.id)}
							aria-pressed={st === true}
							class="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 text-left"
						>
							<span
								class={[
									'grid size-6 shrink-0 place-items-center rounded-[6px] border-2',
									st === true
										? 'border-brand-500 bg-brand-500 text-white'
										: st === 'some'
											? 'border-brand-500 bg-brand-500/30 text-transparent'
											: 'border-stone-400 dark:border-white/30'
								]}
							>
								{#if st === true}<span class="text-xs font-extrabold">✓</span>{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{t.title}</span>
								<span class="block text-[13px] text-stone-500 tabular-nums dark:text-stone-400">
									{t.lessons.reduce((n, l) => n + l.due, 0)}
								</span>
							</span>
						</button>
						<button
							onclick={() => (expanded[t.id] = !(expanded[t.id] ?? true))}
							aria-label="Leckék"
							aria-expanded={expanded[t.id] ?? true}
							class="grid size-8 shrink-0 place-items-center rounded-full text-stone-400"
						>
							<ChevronDown size={18} class={(expanded[t.id] ?? true) ? '' : '-rotate-90'} />
						</button>
					</div>
					{#if expanded[t.id] ?? true}
						<ul class="space-y-1 px-3.5 pb-3.5">
							{#each t.lessons as l (l.id)}
								<li>
									<button
										onclick={() => toggleLesson(l.id)}
										aria-pressed={selLessons.includes(l.id) || !scopeActive}
										class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left"
									>
										<span
											class={[
												'grid size-5 shrink-0 place-items-center rounded-[5px] border-2',
												selLessons.includes(l.id) || !scopeActive
													? 'border-brand-500 bg-brand-500 text-white'
													: 'border-stone-400 dark:border-white/30'
											]}
										>
											{#if selLessons.includes(l.id) || !scopeActive}<span class="text-[11px] font-extrabold">✓</span>{/if}
										</span>
										<span class="min-w-0 flex-1 truncate text-sm font-medium text-ink-900 dark:text-white">{l.title}</span>
										<span class="shrink-0 text-xs font-bold text-stone-400 tabular-nums">{l.due}/{l.total}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</div>
		<button
			onclick={() => {
				sourceOpen = false;
				void loadQueue();
			}}
			class="mt-4 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white"
		>
			Kész
		</button>
	</div>
</Drawer>

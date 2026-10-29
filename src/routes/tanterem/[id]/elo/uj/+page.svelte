<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, untrack } from 'svelte';
	import { ArrowLeft, ChevronDown, Minus, Plus, X } from '@lucide/svelte';
	import ContentPicker, { type ContentPick } from '$lib/components/ContentPicker.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import Switch from '$lib/ui/Switch.svelte';
	import { toast } from '$lib/toast.svelte';
	import { createBackNavigation } from '$lib/back-navigation';
	import type { Subject } from '$lib/curriculum';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const goBack = createBackNavigation(() => resolve('/tanterem/[id]', { id: data.classroomId }));

	let sourceType = $state<'quiz' | 'deck'>('quiz');
	let subjects = $state<Subject[]>([]);
	let pickerOpen = $state(false);
	let picks = $state<ContentPick[]>([]);
	let decks = $state<{ id: string; title: string; count: number }[]>([]);
	let deckIds = $state<string[]>([]);
	let decksOpen = $state(false);
	let count = $state(10);
	let ownPace = $state(true);
	let shuffle = $state(true);
	let stageMode = $state(false);
	let busy = $state(false);

	// Keverés csak saját tempónál, tantermi mód csak együtt haladásnál.
	$effect(() => {
		if (!ownPace && shuffle) untrack(() => (shuffle = false));
	});
	$effect(() => {
		if (ownPace && stageMode) untrack(() => (stageMode = false));
	});

	let lessonIds = $derived(picks.filter((p) => p.lessonId).map((p) => p.lessonId));
	let quizEstimate = $derived(picks.reduce((n, p) => n + (p.quizCount ?? 0), 0));
	let deckEstimate = $derived(
		deckIds.reduce((n, id) => n + (decks.find((d) => d.id === id)?.count ?? 0), 0)
	);
	let activeIds = $derived(sourceType === 'quiz' ? lessonIds : deckIds);
	let estimate = $derived(sourceType === 'quiz' ? quizEstimate : deckEstimate);
	let maxCount = $derived(estimate > 0 ? Math.min(100, estimate) : 50);
	let canAnnounce = $derived(!busy && activeIds.length > 0 && count >= 1);

	onMount(() => {
		void loadSubjects();
		void loadDecks();
	});

	async function loadSubjects() {
		try {
			const res = await fetch('/api/browse');
			const j = await res.json().catch(() => ({}));
			if (Array.isArray(j.subjects)) subjects = j.subjects;
		} catch {
			// csendben: a választó üresen marad
		}
		if (count > maxCount) count = Math.max(1, maxCount);
	}

	async function loadDecks() {
		try {
			const res = await fetch('/api/library');
			const j = await res.json().catch(() => ({}));
			const list = Array.isArray(j.packages) ? j.packages : [];
			decks = list
				.filter((p: { quizId?: unknown }) => typeof p?.quizId === 'string' && (p.quizId as string).startsWith('deck:'))
				.map((p: { quizId: string; title?: unknown; questionCount?: unknown; cardCount?: unknown }) => ({
					id: String(p.quizId).slice('deck:'.length),
					title: String(p.title ?? 'Csomag'),
					count: Number(p.questionCount ?? p.cardCount ?? 0) || 0
				}))
				.filter((d: { id: string }) => d.id.length > 0);
		} catch {
			decks = [];
		}
	}

	function addPicks(next: ContentPick[]) {
		const seen = new Set(lessonIds);
		for (const p of next) {
			if (p.lessonId && !seen.has(p.lessonId)) {
				seen.add(p.lessonId);
				picks = [...picks, p];
			}
		}
		pickerOpen = false;
		if (count > maxCount) count = Math.max(1, maxCount);
	}

	function removePick(lessonId: string) {
		picks = picks.filter((p) => p.lessonId !== lessonId);
	}

	function toggleDeck(id: string) {
		deckIds = deckIds.includes(id) ? deckIds.filter((d) => d !== id) : [...deckIds, id];
		if (count > maxCount) count = Math.max(1, maxCount);
	}

	function step(delta: number) {
		count = Math.min(Math.max(1, maxCount), count + delta);
	}

	async function announce(draft: boolean) {
		if (!canAnnounce) return;
		busy = true;
		try {
			const res = await fetch('/api/live', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					classroomId: data.classroomId,
					draft,
					config: {
						lessonIds: sourceType === 'quiz' ? lessonIds : [],
						deckIds: sourceType === 'deck' ? deckIds : [],
						orderMode: ownPace && shuffle ? 'shuffled' : 'same',
						count,
						pacing: ownPace ? 'self' : 'synced',
						playMode: !ownPace && stageMode ? 'stage' : 'solo'
					}
				})
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(draft ? 'Nem sikerült menteni' : 'Nem sikerült meghirdetni', j.error ?? 'Próbáld újra!');
				return;
			}
			if (draft) {
				toast.success('Piszkozat mentve');
				await goto(resolve('/tanterem/[id]', { id: data.classroomId }));
			} else {
				toast.success('Élő dolgozat meghirdetve');
				await goto(resolve('/elo/[id]', { id: String(j.id) }));
			}
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Élő dolgozat indítása | Leardy</title>
</svelte:head>

<div class="flex items-center gap-2 px-1">
	<IconButton ariaLabel="Vissza" size={44} onclick={goBack}>
		<ArrowLeft size={21} />
	</IconButton>
	<div class="min-w-0 flex-1">
		<h1 class="font-display truncate text-[26px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
			Élő dolgozat
		</h1>
		<p class="truncate text-[13px] font-semibold text-stone-500 dark:text-stone-400">
			Forrás és szabályok
		</p>
	</div>
</div>

<div class="mt-4 grid gap-2.5 pb-40">
	<Card>
		<div class="anim-rise" style="--d:0ms">
			<p class="text-[11px] font-extrabold tracking-[0.14em] text-stone-400 uppercase dark:text-stone-500">
				01, Forrás
			</p>
			<div class="mt-3">
				<Segmented
					animated
					ariaLabel="Forrás típusa"
					options={[
						{ value: 'quiz', label: 'Lecke kvízek' },
						{ value: 'deck', label: 'Kártya csomagok' }
					]}
					bind:value={sourceType}
				/>
			</div>
			{#if sourceType === 'quiz'}
				<button
					type="button"
					onclick={() => (pickerOpen = true)}
					class="mt-2 flex w-full min-w-0 items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-left transition hover:bg-stone-50 active:scale-[0.99] motion-reduce:transition-none dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
				>
					<span class="min-w-0 flex-1">
						<span class="block text-[11px] font-bold tracking-wider text-stone-400 uppercase dark:text-stone-500">Leckék</span>
						<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
							{picks.length > 0 ? `${picks.length} kiválasztva` : 'Választás'}
						</span>
					</span>
					<ChevronDown size={16} class="shrink-0 text-stone-400" aria-hidden="true" />
				</button>
				{#if picks.length > 0}
					<ul class="mt-2 flex flex-wrap gap-1.5">
						{#each picks as p (p.lessonId)}
							<li class="flex max-w-full items-center gap-1 rounded-full bg-brand-50 py-1 pr-1 pl-3 text-[13px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-white">
								<span class="min-w-0 truncate">{p.crumb || p.lessonTitle}</span>
								<button
									type="button"
									aria-label="Törlés"
									onclick={() => removePick(p.lessonId)}
									class="grid size-6 shrink-0 place-items-center rounded-full transition hover:bg-black/5 active:scale-95 dark:hover:bg-white/10"
								>
									<X size={14} aria-hidden="true" />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			{:else if decks.length > 0}
				<ul class="mt-2 grid gap-1.5">
					{#each decks as d (d.id)}
						{@const active = deckIds.includes(d.id)}
						<li>
							<button
								type="button"
								aria-pressed={active}
								onclick={() => toggleDeck(d.id)}
								class={[
									'flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none',
									active
										? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/15'
										: 'border-stone-200 bg-white hover:bg-stone-50 dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5'
								]}
							>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">{d.title}</span>
									<span class="block text-[12px] font-semibold text-stone-500 dark:text-stone-400">{d.count} kártya</span>
								</span>
								<span class={[
									'grid size-6 shrink-0 place-items-center rounded-full text-[13px] font-extrabold',
									active ? 'bg-brand-500 text-white' : 'bg-stone-100 text-stone-400 dark:bg-white/10 dark:text-stone-400'
								]} aria-hidden="true">
									{active ? '✓' : '+'}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-2 text-[13px] font-medium text-stone-500 dark:text-stone-400">
					Még nincs saját kártyacsomagod. A Kártyák oldalon hozhatsz létre.
				</p>
			{/if}
		</div>
	</Card>

	<Card>
		<div class="anim-rise" style="--d:60ms">
			<p class="text-[11px] font-extrabold tracking-[0.14em] text-stone-400 uppercase dark:text-stone-500">
				02, Kérdésszám
			</p>
			<h2 class="font-display mt-1 text-[18px] font-extrabold tracking-tight text-ink-900 dark:text-white">
				Hány kérdés legyen
			</h2>
			<div class="mt-3 flex items-center justify-center gap-4">
				<IconButton ariaLabel="Kevesebb kérdés" size={44} onclick={() => step(-1)}>
					<Minus size={18} />
				</IconButton>
				<p class="font-display min-w-[72px] text-center text-[34px] leading-none font-extrabold tabular-nums text-ink-900 dark:text-white">
					{count}
				</p>
				<IconButton ariaLabel="Több kérdés" size={44} onclick={() => step(1)}>
					<Plus size={18} />
				</IconButton>
			</div>
			<input
				type="range"
				min={1}
				max={maxCount}
				bind:value={count}
				aria-label="Kérdésszám"
				class="mt-3 w-full accent-brand-500"
			/>
			<p class="mt-2 text-center text-[13px] font-semibold text-stone-500 dark:text-stone-400">
				{#if estimate > 0}
					Ebből a választásból legfeljebb {estimate} kérdés készíthető.
				{:else}
					Válassz forrást, utána itt látod a legfeljebb készíthető darabszámot.
				{/if}
			</p>
		</div>
	</Card>

	<Card>
		<div class="anim-rise" style="--d:120ms">
			<p class="text-[11px] font-extrabold tracking-[0.14em] text-stone-400 uppercase dark:text-stone-500">
				03, Szabályok
			</p>
			<div class="mt-3 grid gap-2">
				<div class={[
					'flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3.5 py-3 dark:border-white/10 dark:bg-stone-900',
					!ownPace && 'opacity-90'
				]}>
					<span class="min-w-0 flex-1">
						<span class="block text-[14px] font-extrabold text-ink-900 dark:text-white">
							A diákok saját tempójukban haladhatnak
						</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
							{ownPace ? 'Mindenki a saját ritmusában halad.' : 'Kikapcsolva: a tanár léptet kérdésről kérdésre.'}
						</span>
					</span>
					<Switch label="Saját tempó" bind:checked={ownPace} />
				</div>
				<div class={[
					'flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3.5 py-3 dark:border-white/10 dark:bg-stone-900',
					!ownPace && 'opacity-60'
				]}>
					<span class="min-w-0 flex-1">
						<span class="block text-[14px] font-extrabold text-ink-900 dark:text-white">
							Minden diák más feladatokat kap
						</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
							{ownPace ? 'Mindenki más sorrendben kapja a kérdéseket.' : 'Csak saját tempónál kapcsolható be.'}
						</span>
					</span>
					<Switch label="Keverés" bind:checked={shuffle} disabled={!ownPace} />
				</div>
				<div class={[
					'flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3.5 py-3 dark:border-white/10 dark:bg-stone-900',
					ownPace && 'opacity-60'
				]}>
					<span class="min-w-0 flex-1">
						<span class="block text-[14px] font-extrabold text-ink-900 dark:text-white">
							Tantermi mód
						</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
							{ownPace ? 'Csak együtt haladásnál kapcsolható be.' : 'A kérdés a táblán, a diákoknál csak a válaszgombok.'}
						</span>
					</span>
					<Switch label="Tantermi mód" bind:checked={stageMode} disabled={ownPace} />
				</div>
			</div>
		</div>
	</Card>
</div>

<div class="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/90 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-white/10 dark:bg-stone-950/90">
	<div class="mx-auto grid w-full max-w-2xl grid-cols-2 gap-2">
		<Button variant="outline" size="lg" block disabled={!canAnnounce} onclick={() => announce(true)}>
			{busy ? 'Mentés…' : 'Piszkozat mentése'}
		</Button>
		<Button size="lg" block disabled={!canAnnounce} onclick={() => announce(false)}>
			{busy ? 'Meghirdetés…' : 'Meghirdetés'}
		</Button>
	</div>
</div>

<ContentPicker
	open={pickerOpen}
	subjects={subjects}
	select="lesson"
	multi
	onlyWithQuiz
	initialSelected={picks}
	onPick={addPicks}
	onClose={() => (pickerOpen = false)}
/>

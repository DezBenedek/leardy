<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowLeft, ArrowLeftRight, ChevronDown } from '@lucide/svelte';
	import WordPractice from '$lib/components/WordPractice.svelte';
	import type { Package } from '$lib/curriculum';
	import { loadDeckOpened } from '$lib/deck-history';
	import { Query } from '$lib/query.svelte';
	import { gradeSM2, summarizeSM2, todayDay } from '$lib/sm2';
	import Button from '$lib/ui/Button.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';

	/* Nyelvi összesített SM-2 gyakorlás: a könyvtár összes csomagja egy tantárgyból.
	   Nyugodt sorrend: egy csomag kártyái együtt jönnek, csomagon belül
	   esedékes, új, végül jövőbeli. A legutóbb megnyitott csomagok vannak elöl. */

	interface Mark {
		known: number;
		seen: number;
		repetitions?: number;
		ease?: number;
		intervalDays?: number;
		dueDay?: number;
	}

	interface WordsData {
		packages: Package[];
		progress: Record<string, Mark>;
		today: number;
	}

	const subjectId = $derived(page.params.subjectId ?? '');
	const wordsQ = new Query<WordsData>();
	const TTL = 5 * 60_000;
	const STALE = 15 * 60_000;

	$effect(() => {
		wordsQ.load(
			subjectId ? `subject-words:${subjectId}` : null,
			async () => {
				const res = await fetch(`/api/subject-words?subject=${encodeURIComponent(subjectId)}`);
				if (!res.ok) throw new Error('load failed');
				return res.json();
			},
			TTL,
			STALE
		);
	});

	let packages = $derived(wordsQ.data?.packages ?? []);
	let progress = $state<Record<string, Mark>>({});
	$effect(() => {
		progress = wordsQ.data?.progress ?? {};
	});

	let swapped = $state(false);
	let listOpen = $state(false);
	let pendingMarks = $state<{ key: string; known: boolean }[]>([]);

	let questions = $derived(packages.flatMap((p) => p.questions));
	let cardToPack = $derived.by(() => {
		const m: Record<string, string> = {};
		for (const p of packages) for (const q of p.questions) m[q.id] = p.quizId;
		return m;
	});
	let recentPackIds = $derived.by(() => {
		try {
			const opened = loadDeckOpened();
			return Object.entries(opened)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 3)
				.map(([k]) => k);
		} catch {
			return [];
		}
	});
	let subjectTitle = $derived(packages[0]?.subjectTitle?.trim() || 'Szavak');
	let total = $derived(questions.length);
	let dueCount = $derived(total > 0 ? summarizeSM2(questions, progress, todayDay()).due : 0);

	function goBack() {
		// Félúton visszalépéskor az addigi válaszok mentődnek.
		void saveMarks();
		try {
			if (window.history.length > 1) {
				window.history.back();
				return;
			}
		} catch {
			// fallback alább
		}
		void goto('/');
	}

	async function saveMarks() {
		const marks = pendingMarks;
		pendingMarks = [];
		if (marks.length === 0) return;
		try {
			const res = await fetch('/api/card-progress', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ results: marks.map((m) => ({ key: m.key, known: m.known })) })
			});
			if (res.ok) {
				const nowDay = todayDay();
				const next = { ...progress };
				for (const m of marks) {
					const cur = next[m.key] ?? { known: 0, seen: 0 };
					const sm = gradeSM2(cur, m.known, nowDay);
					next[m.key] = {
						known: sm.known,
						seen: sm.seen,
						repetitions: sm.repetitions,
						ease: sm.ease,
						intervalDays: sm.intervalDays,
						dueDay: sm.dueDay
					};
				}
				progress = next;
				wordsQ.touch();
			}
		} catch {
			// legközelebb szinkronizál
		}
	}
</script>

<svelte:head>
	<title>{subjectTitle} szavak | Leardy</title>
</svelte:head>

<div class="flex items-center gap-2">
	<IconButton ariaLabel="Vissza" size={44} onclick={goBack}>
		<ArrowLeft size={21} />
	</IconButton>
	<div class="min-w-0 flex-1">
		<h1 class="font-display truncate text-[22px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
			{subjectTitle} szavak
		</h1>
		<p class="truncate text-[13px] font-medium text-stone-500 dark:text-stone-400">
			{total} szó · {packages.length} csomag{#if dueCount > 0} · {dueCount} esedékes{/if}
		</p>
	</div>
	<IconButton
		ariaLabel="Előlap és hátlap cseréje"
		title="Előlap és hátlap cseréje"
		size={44}
		onclick={() => (swapped = !swapped)}
	>
		<ArrowLeftRight size={20} />
	</IconButton>
</div>

{#if wordsQ.loading}
	<div role="status" aria-label="Betöltés" class="mt-4 grid gap-2.5">
		<Skeleton cls="h-24 rounded-[20px]" />
		<Skeleton cls="h-72 rounded-[24px]" />
		<span class="sr-only">Betöltés…</span>
	</div>
{:else if wordsQ.error}
	<div class="mt-4">
		<EmptyState title="Nem sikerült betölteni" description="Próbáld újra később." />
		<div class="mt-4 flex justify-center">
			<Button href="/">Vissza a főoldalra</Button>
		</div>
	</div>
{:else if total === 0}
	<div class="mt-4">
		<EmptyState
			title="Nincs letöltött szókártya"
			description="Ments a könyvtáradba ebből a nyelvből, és itt gyakorolhatod."
		/>
		<div class="mt-4 flex justify-center gap-2">
			<Button href="/kartyak/felfedezes">Felfedezés</Button>
			<Button variant="outline" href="/kartyak">Könyvtár</Button>
		</div>
	</div>
{:else}
	<div class="mt-3">
		{#key subjectId}
			<WordPractice
				questions={questions}
				progress={progress}
				swapped={swapped}
				embedded
				recentPackIds={recentPackIds}
				cardToPack={cardToPack}
				packOrder={packages.map((p) => p.quizId)}
				onMark={(idQ, known) => (pendingMarks = [...pendingMarks, { key: idQ, known }])}
				onDone={() => void saveMarks()}
			/>
		{/key}
	</div>

	<section aria-label="Csomagok" class="mt-4 pb-6">
		<div class="rounded-[20px] border border-stone-200 bg-white dark:border-white/10 dark:bg-stone-900">
			<button
				type="button"
				aria-expanded={listOpen}
				onclick={() => (listOpen = !listOpen)}
				class="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-white/5 dark:active:bg-white/10"
			>
				<span class="min-w-0 flex-1 truncate text-[13px] font-extrabold tracking-wide text-stone-400 uppercase dark:text-stone-500">
					Ebből gyakorolsz · {packages.length}
				</span>
				<ChevronDown
					size={18}
					class={[
						'shrink-0 text-stone-400 transition-transform duration-300 motion-reduce:transition-none',
						listOpen ? 'rotate-180' : ''
					]}
					aria-hidden="true"
				/>
			</button>
			<div
				class="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
				style="grid-template-rows: {listOpen ? '1fr' : '0fr'}"
			>
				<div class="min-h-0 overflow-hidden">
					<div class="grid gap-2 border-t border-stone-100 px-3 py-3 dark:border-white/5">
						{#each packages as p (p.quizId)}
							<a
								href="/kartyak/{encodeURIComponent(p.quizId)}"
								class="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 transition hover:border-brand-300 active:scale-[0.99] dark:border-white/10 dark:bg-stone-900"
							>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">{p.title}</span>
									<span class="block truncate text-[12px] font-medium text-stone-500 dark:text-stone-400">
										{p.questionCount} szó
									</span>
								</span>
							</a>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</section>
{/if}

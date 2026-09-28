<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { ArrowLeft, BookOpen, GraduationCap, Layers, Pencil, Plus, Trash2 } from '@lucide/svelte';
	import FlipCards from '$lib/components/FlipCards.svelte';
	import QuizModal from '$lib/components/QuizModal.svelte';
	import SmartLearn from '$lib/components/SmartLearn.svelte';
	import WriteTest from '$lib/components/WriteTest.svelte';
	import type { Package, QuizQuestion } from '$lib/curriculum';
	import { Query, markLessonDone } from '$lib/query.svelte';
	import { toast } from '$lib/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';

	/* Kártyacsomag-adatlap: saját deckek és hivatalos (leckénkénti) csomagok.
	   A kvízek nem tartoznak ide: a kvíz a lecke oldalán él.
	   Mindkét fajta 3 gyakorlási módot kap: Kártya, Teszt, Tanulás. */

	interface Mark {
		known: number;
		seen: number;
	}

	interface Detail {
		package: Package;
		progress: Record<string, Mark>;
	}

	const id = $derived(page.params.id ?? '');
	const detailQ = new Query<Detail>();
	let detailOffline = $state(false);

	/* Gyorstár-ablakok: friss = nincs hálózat, öreg = mutatható + csendben frissül. */
	const PKG_TTL = 10 * 60_000;
	const PKG_STALE = 30 * 60_000;

	// Első paint előtti előtöltés: visszalépéskor rögtön adat, skeleton nélkül.
	untrack(() => {
		detailQ.prime(id ? `package:${id}` : null, PKG_STALE);
	});

	$effect(() => {
		detailQ.load(id ? `package:${id}` : null, fetchDetail, PKG_TTL, PKG_STALE);
		void fetchSavedIds();
	});

	async function fetchSavedIds() {
		try {
			const res = await fetch('/api/library?ids=1');
			const j = await res.json();
			const ids: Record<string, boolean> = {};
			if (res.ok) for (const qid of j.ids ?? []) ids[qid] = true;
			savedIds = ids;
		} catch {
			// néma hiba: marad az előző állapot
		}
	}

	async function addToLibrary() {
		try {
			const res = await fetch('/api/library', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ quizId: id })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(j.error ?? 'Hiba történt.');
			savedIds = { ...savedIds, [id]: true };
			toast.success('Könyvtárba mentve!', 'Offline is megnyithatod majd.');
		} catch (e) {
			toast.error('Nem sikerült menteni', e instanceof Error ? e.message : 'Hiba történt.');
		}
	}

	async function fetchDetail(): Promise<Detail> {
		// A Kártyák területen saját deckek (deck:...) és hivatalos csomagok
		// (pack:..., régi alakban cards:...) vannak. Régi kvíz-azonosítóval már 404-et adunk.
		if (!id.startsWith('deck:') && !id.startsWith('pack:') && !id.startsWith('cards:'))
			throw new Error('not-found');
		try {
			const res = await fetch(`/api/packages?id=${encodeURIComponent(id)}`);
			if (!res.ok) throw new Error(`http ${res.status}`);
			detailOffline = false;
			return res.json();
		} catch (e) {
			// Hálózat nélkül a könyvtár-gyorstárból szolgálunk (csak mentett csomag).
			if (e instanceof TypeError) {
				try {
					const raw = localStorage.getItem('leardy-library');
					const pkgs = raw ? ((JSON.parse(raw).packages ?? []) as Package[]) : [];
					const found = pkgs.find((p) => p.quizId === id);
					if (found) {
						detailOffline = true;
						return { package: found, progress: {} };
					}
				} catch {
					// sérült gyorstár
				}
			}
			throw e;
		}
	}

	let pkg = $derived(detailQ.data?.package ?? null);
	let progress = $state<Record<string, Mark>>({});
	/** A könyvtárban lévő csomagok: a mentés/kuka gomb ehhez igazodik. */
	let savedIds = $state<Record<string, boolean>>({});
	let inLibrary = $derived(!pkg ? false : pkg.mine ? true : !!savedIds[id]);

	$effect(() => {
		progress = detailQ.data?.progress ?? {};
	});

	let practiceOpen = $state(false);
	let practiceMode = $state<'cards' | 'write' | 'learn'>('cards');
	let session = $state(0);
	let pendingMarks = $state<{ key: string; known: boolean }[]>([]);
	/** A csatolt lecke bekezdései a csoportosításhoz. */
	let sections = $state<{ slug: string; title: string }[]>([]);

	$effect(() => {
		// Saját csomagoknál nincs bekezdés-csoportosítás, a szekciók sem kellenek.
		const lid = pkg && !pkg.mine ? pkg.attachedLessonId : undefined;
		if (!lid) {
			sections = [];
			return;
		}
		void (async () => {
			try {
				const res = await fetch(`/api/lessons/${encodeURIComponent(lid)}/sections`);
				const j = await res.json();
				sections = res.ok ? (j.sections ?? []) : [];
			} catch {
				sections = [];
			}
		})();
	});

	/** Kártyák bekezdés-csoportokban (csak hivatalos csomag csatolt leckéje szerint).
	   Saját csomag mindig csoportosítatlan lista. */
	let groups = $derived.by(() => {
		const qs = pkg?.questions ?? [];
		const grouped = !!pkg && !pkg.mine && !!pkg.attachedLessonId && sections.length > 0;
		if (!grouped) return [{ key: 'all', title: '', questions: qs }];
		const bySlug = new Map<string, QuizQuestion[]>();
		const rest: QuizQuestion[] = [];
		for (const q of qs) {
			const s = q.sectionSlug ?? '';
			if (!s) rest.push(q);
			else {
				const list = bySlug.get(s) ?? [];
				list.push(q);
				bySlug.set(s, list);
			}
		}
		const out: { key: string; title: string; questions: QuizQuestion[] }[] = [];
		if (rest.length > 0) out.push({ key: '', title: 'Besorolatlan', questions: rest });
		for (const s of sections) {
			const list = bySlug.get(s.slug);
			if (list?.length) out.push({ key: s.slug, title: s.title, questions: list });
		}
		for (const [slug, list] of bySlug) {
			if (!sections.some((s) => s.slug === slug)) out.push({ key: slug, title: 'Egyéb', questions: list });
		}
		return out;
	});

	type Level = 'new' | 'learning' | 'known';

	function levelOf(q: QuizQuestion): Level {
		const m = progress[q.id];
		if (!m || m.seen === 0) return 'new';
		return m.known >= 2 ? 'known' : 'learning';
	}

	const LEVEL_LABEL: Record<Level, string> = { new: 'Új', learning: 'Tanulom', known: 'Tudom' };
	const LEVEL_DOT: Record<Level, string> = {
		new: 'bg-stone-300 dark:bg-white/20',
		learning: 'bg-amber-400',
		known: 'bg-emerald-500'
	};

	let total = $derived(pkg?.questions.length ?? 0);
	let knownCount = $derived(pkg?.questions.filter((q) => levelOf(q) === 'known').length ?? 0);
	let knownPct = $derived(total > 0 ? Math.round((knownCount / total) * 100) : 0);

	function goBack() {
		// Hierarchia szerint vissza a könyvtárba: a history.back() az
		// adatlap és a szerkesztő között pattogna oda-vissza.
		void goto('/kartyak');
	}

	function goEdit() {
		void goto(`/kartyak/${encodeURIComponent(id)}/edit`);
	}

	async function removeFromLibrary() {
		try {
			const res = await fetch('/api/library', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ quizId: id })
			});
			if (!res.ok) throw new Error('Hiba történt.');
			toast.success('Eltávolítva a könyvtárból.');
			void goto('/kartyak');
		} catch (e) {
			toast.error('Nem sikerült eltávolítani', e instanceof Error ? e.message : 'Hiba történt.');
		}
	}

	function openPractice(mode: 'cards' | 'write' | 'learn') {
		pendingMarks = [];
		practiceMode = mode;
		session += 1;
		practiceOpen = true;
	}

	async function reportProgress(lessonId: string, score: number, totalQ: number) {
		if (!lessonId) return;
		try {
			const res = await fetch('/api/progress', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lessonId, done: 1, score, total: totalQ })
			});
			if (res.ok) markLessonDone(lessonId);
		} catch {
			// néma hiba
		}
	}

	async function finishPractice(score: number, totalQ: number) {
		const marks = pendingMarks;
		pendingMarks = [];
		if (marks.length > 0) {
			try {
				const res = await fetch('/api/card-progress', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ results: marks.map((m) => ({ key: m.key, known: m.known })) })
				});
				if (res.ok) {
					const next = { ...progress };
					for (const m of marks) {
						const cur = next[m.key] ?? { known: 0, seen: 0 };
						next[m.key] = {
							known: m.known ? cur.known + 1 : 0,
							seen: cur.seen + 1
						};
					}
					progress = next;
				}
			} catch {
				// a pöttyök legközelebb szinkronizálódnak
			}
		}
		if (pkg?.lessonId) await reportProgress(pkg.lessonId, score, totalQ);
	}
</script>

<svelte:head>
	<title>{pkg ? `${pkg.title}: Kártyák` : 'Kártyák'} | Leardy</title>
</svelte:head>

{#if detailQ.loading}
	<div role="status" aria-label="Betöltés" class="grid gap-2.5">
		<Skeleton cls="h-7 w-2/3 rounded-lg" />
		<Skeleton cls="h-4 w-1/2 rounded-md" />
		<Skeleton cls="h-24 rounded-[20px]" />
		<Skeleton cls="h-12 rounded-2xl" />
		<Skeleton cls="h-12 rounded-2xl" />
		<span class="sr-only">Betöltés…</span>
	</div>
{:else if detailQ.error || !pkg}
	<EmptyState
		title="Nem található"
		description="Ezt a csomagot törölték, vagy nincs hozzáférésed."
	/>
	<div class="mt-4 flex justify-center">
		<Button href="/kartyak">Vissza a csomagokhoz</Button>
	</div>
{:else}
	<div class="flex items-center gap-2">
		<IconButton ariaLabel="Vissza a csomagokhoz" size={44} onclick={goBack}>
			<ArrowLeft size={21} />
		</IconButton>
		<div class="min-w-0 flex-1">
			<h1 class="font-display truncate text-[22px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
				{pkg.title}
			</h1>
			<p class="truncate text-[13px] font-medium text-stone-500 dark:text-stone-400">
				{pkg.subjectTitle}{#if pkg.levelTitle} · {pkg.levelTitle}{/if}{#if pkg.materialTitle} · {pkg.materialTitle}{/if} · {total} kártya
			</p>
			{#if detailOffline}
				<p class="mt-0.5 inline-block rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-extrabold text-amber-600 uppercase dark:text-amber-300">
					Offline nézet
				</p>
			{/if}
		</div>
		{#if pkg.mine}
			<IconButton ariaLabel="Csomag szerkesztése" size={44} onclick={goEdit}>
				<Pencil size={20} />
			</IconButton>
		{:else if inLibrary}
			<IconButton
				ariaLabel="Eltávolítás a könyvtárból"
				title="Eltávolítás a könyvtárból"
				size={44}
				tone="danger"
				onclick={removeFromLibrary}
			>
				<Trash2 size={20} />
			</IconButton>
		{:else}
			<IconButton
				ariaLabel="Mentés a könyvtárba: {pkg.title}"
				title="Mentés a könyvtárba"
				size={44}
				onclick={addToLibrary}
			>
				<Plus size={20} />
			</IconButton>
		{/if}
	</div>

	{#if total > 0}
		<section aria-label="Tudásszint" class="mt-4 rounded-[20px] border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
			<div class="flex items-baseline justify-between gap-2">
				<p class="text-[14px] font-bold text-ink-900 dark:text-white">
					{knownCount}/{total} tudom
				</p>
				<p class="text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
					{knownPct}%
				</p>
			</div>
			<div
				class="mt-2 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10"
				role="progressbar"
				aria-valuenow={knownCount}
				aria-valuemin={0}
				aria-valuemax={total}
				aria-label="Tudott kártyák"
			>
				<div
					class="h-full rounded-full bg-emerald-500 transition-all duration-300 motion-reduce:transition-none"
					style="width: {knownPct}%"
				></div>
			</div>
			<div class="mt-4">
				<div class="grid grid-cols-3 gap-2">
					<Button variant="outline" size="lg" onclick={() => openPractice('cards')}>
						<Layers size={18} /> Kártya
					</Button>
					<Button variant="outline" size="lg" onclick={() => openPractice('write')}>
						Teszt
					</Button>
					<Button size="lg" onclick={() => openPractice('learn')}>
						<GraduationCap size={18} /> Tanulás
					</Button>
				</div>
			</div>
			{#if pkg.lessonId}
				<div class="mt-2.5 text-center">
					<a
						href="/lecke/{pkg.lessonId}"
						class="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-600 transition hover:text-brand-700 dark:text-brand-300 dark:hover:text-white"
					>
						<BookOpen size={15} /> Ugrás a leckére
					</a>
				</div>
			{/if}
		</section>

		<div class="mt-3 grid gap-4">
			{#each groups as g (g.key)}
				<div>
					{#if g.title}
						<p class="px-1 pb-1.5 text-[13px] font-extrabold tracking-wide text-stone-400 uppercase dark:text-stone-500">
							{g.title} · {g.questions.length}
						</p>
					{/if}
					<div class="divide-y divide-stone-100 overflow-hidden rounded-[20px] border border-stone-200 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-stone-900">
						{#each g.questions as q (q.id)}
							{@const lv = levelOf(q)}
							<div class="flex items-center gap-2.5 px-3.5 py-2.5">
								<span
									class="size-2.5 shrink-0 rounded-full {LEVEL_DOT[lv]}"
									title={LEVEL_LABEL[lv]}
									aria-label={LEVEL_LABEL[lv]}
								></span>
								<span class="min-w-0 flex-1 text-[14px] font-bold break-words text-ink-900 dark:text-white">
									{q.question_text}
								</span>
								<span class="w-px shrink-0 self-stretch bg-stone-200 dark:bg-white/10" aria-hidden="true"></span>
								<span class="min-w-0 flex-1 text-[14px] font-medium break-words text-stone-500 dark:text-stone-300">
									{q.correct_answer}
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
		{#if pkg.attachedLessonId}
			<div class="mt-3 text-center">
				<a
					href="/lecke/{pkg.attachedLessonId}"
					class="text-[13px] font-bold text-brand-600 transition hover:text-brand-700 dark:text-brand-300 dark:hover:text-white"
				>
					Csatolva: {pkg.attachedLessonTitle || 'lecke'}
				</a>
			</div>
		{/if}
		<p class="mt-3 text-center text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
			{pkg.mine ? 'Saját csomag' : 'Hivatalos csomag'}
		</p>
	{:else}
		<div class="mt-4">
			<EmptyState
				title="Üres csomag"
				description={pkg.mine
					? 'Vedd fel az első kártyákat a szerkesztőben!'
					: 'Ehhez a csomaghoz még nem tartozik kártya.'}
			/>
			{#if pkg.mine}
				<div class="mt-4">
					<Button block size="lg" onclick={goEdit}>
						<Pencil size={17} /> Szerkesztés
					</Button>
				</div>
			{/if}
		</div>
	{/if}
{/if}

<QuizModal open={practiceOpen} label={pkg?.title ?? 'Gyakorlás'} title={pkg?.title} onClose={() => (practiceOpen = false)}>
	{#if pkg && practiceOpen}
		{#key session}
			<div class="pt-1">
				{#if practiceMode === 'write'}
					<WriteTest
						questions={pkg.questions}
						onMark={(idQ, known) => (pendingMarks = [...pendingMarks, { key: idQ, known }])}
						onDone={(score, totalQ) => void finishPractice(score, totalQ)}
					/>
				{:else if practiceMode === 'learn'}
					<SmartLearn
						questions={pkg.questions}
						onMark={(idQ, known) => (pendingMarks = [...pendingMarks, { key: idQ, known }])}
						onDone={(score, totalQ) => void finishPractice(score, totalQ)}
					/>
				{:else}
					<FlipCards
						questions={pkg.questions}
						onCard={(idQ, known) => (pendingMarks = [...pendingMarks, { key: idQ, known }])}
						onDone={(score, totalQ) => void finishPractice(score, totalQ)}
					/>
				{/if}
			</div>
		{/key}
	{/if}
</QuizModal>

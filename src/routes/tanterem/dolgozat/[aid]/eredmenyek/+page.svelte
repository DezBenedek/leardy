<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { ArrowLeft, RefreshCw } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { studyApi, type AssignmentMeta, type AssignmentResultRow } from '$lib/study';

	let { params } = $props();

	let meta = $state<AssignmentMeta | null>(null);
	let rows = $state<AssignmentResultRow[]>([]);
	let err = $state<string | null>(null);
	let loaded = $state(false);
	let refreshing = $state(false);
	let updatedAt = $state<number | null>(null);

	let isTeacher = $derived((auth.user?.role ?? 'student') === 'teacher');
	let isAdmin = $derived((auth.user?.is_admin ?? 0) === 1);

	const POLL_MS = 10000;
	let timer: ReturnType<typeof setInterval> | undefined;

	async function load(silent = false) {
		if (!silent) err = null;
		if (silent) refreshing = true;
		try {
			const d = await studyApi.assignmentResults(params.aid);
			meta = d.assignment;
			rows = d.rows;
			updatedAt = Date.now();
		} catch (e) {
			if (!loaded) err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loaded = true;
			refreshing = false;
		}
	}

	onMount(() => {
		void load();
		timer = setInterval(() => {
			try {
				if (!document.hidden) void load(true);
			} catch {
				void load(true);
			}
		}, POLL_MS);
	});

	onDestroy(() => {
		if (timer) clearInterval(timer);
	});

	$effect(() => {
		void auth.user;
		void load();
	});

	function filling(r: AssignmentResultRow): boolean {
		return r.open_since !== null && (r.last_submit === null || r.open_since > r.last_submit);
	}

	function pct(r: AssignmentResultRow): number | null {
		if (r.best === null || !meta || meta.questions === 0) return null;
		return Math.round((r.best / meta.questions) * 100);
	}

	function passed(r: AssignmentResultRow): boolean {
		const p = pct(r);
		if (p === null) return false;
		return p >= (meta?.min_score ?? 0);
	}

	type Shown = { r: AssignmentResultRow; rank: number };
	let shown = $derived<Shown[]>(
		rows
			.map((r) => ({
				r,
				rank: filling(r) ? 0 : r.attempts > 0 ? 1 : 2
			}))
			.sort((a, b) => a.rank - b.rank || (b.r.best ?? -1) - (a.r.best ?? -1) || a.r.name.localeCompare(b.r.name, 'hu'))
	);

	let nFilling = $derived(rows.filter(filling).length);
	let nSubmitted = $derived(rows.filter((r) => r.attempts > 0).length);

	function rel(ts: number | null): string {
		if (!ts) return '';
		const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
		if (m < 1) return 'épp most';
		if (m < 60) return `${m} perce`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h} órája`;
		return `${Math.floor(h / 24)} napja`;
	}

	function fmtDue(ts: number): string {
		if (!ts) return 'nincs határidő';
		return new Date(ts).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function clock(ts: number | null): string {
		if (!ts) return '';
		return new Date(ts).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}
</script>

<svelte:head>
	<title>{meta ? `${meta.title} — Eredmények` : 'Eredmények — Leardy'}</title>
</svelte:head>

<div class="mt-3 flex items-center gap-2">
	<a
		href={meta ? `/tanterem/${meta.classroom_id}` : '/tanterem'}
		aria-label="Vissza az osztályhoz"
		class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-900 transition hover:bg-stone-50 active:scale-95 dark:hover:bg-white/10 dark:border-white/10 dark:bg-stone-900 dark:text-white"
	>
		<ArrowLeft size={20} />
	</a>
	<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">
		{meta ? meta.title : 'Eredmények'}
	</h1>
	<button
		onclick={() => void load(true)}
		disabled={refreshing}
		aria-label="Frissítés"
		class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-600 transition hover:bg-stone-50 active:scale-95 disabled:opacity-60 dark:hover:bg-white/10 dark:border-white/10 dark:bg-stone-900 dark:text-stone-300"
	>
		<RefreshCw size={18} class={refreshing ? 'animate-spin' : ''} />
	</button>
</div>

{#if err && !meta}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else if !loaded}
	<p class="animate-pulse mt-3 text-sm text-stone-500 dark:text-stone-400">Betöltés…</p>
{:else if meta && !(isTeacher || isAdmin)}
	<p class="mt-3 rounded-2xl border border-stone-200 bg-white p-6 text-center text-sm dark:border-white/10 dark:bg-stone-900">Ez tanári felület.</p>
{:else if meta}
	<div class="mt-2 flex flex-wrap items-center gap-1.5">
		<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-[12px] font-extrabold text-white">
			<span class="relative flex size-2">
				<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
				<span class="relative inline-flex size-2 rounded-full bg-white"></span>
			</span>
			ÉLŐ
		</span>
		<span class="rounded-full bg-stone-100 px-3 py-1 text-[12px] font-bold text-stone-600 dark:bg-white/10 dark:text-stone-300">
			{meta.is_exam === 1 ? 'Dolgozat' : 'Feladat'} · {meta.questions} kérdés
		</span>
		{#if meta.min_score > 0}
			<span class="rounded-full bg-stone-100 px-3 py-1 text-[12px] font-bold text-stone-600 tabular-nums dark:bg-white/10 dark:text-stone-300">
				Cél: {meta.min_score}%
			</span>
		{/if}
		<span class="rounded-full bg-stone-100 px-3 py-1 text-[12px] font-bold text-stone-600 dark:bg-white/10 dark:text-stone-300">
			Határidő: {fmtDue(meta.due_date)}
		</span>
		{#if updatedAt}
			<span class="text-[12px] font-medium text-stone-400 tabular-nums dark:text-stone-500">Frissítve: {clock(updatedAt)}</span>
		{/if}
	</div>

	<div class="mt-3 grid grid-cols-3 gap-2 text-center">
		<div class="rounded-2xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-stone-900">
			<p class="font-display text-[24px] font-extrabold text-ink-900 tabular-nums dark:text-white">{rows.length}</p>
			<p class="text-[12px] font-bold text-stone-500 dark:text-stone-400">Tag</p>
		</div>
		<div class="rounded-2xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-stone-900">
			<p class="font-display text-[24px] font-extrabold text-emerald-600 tabular-nums dark:text-emerald-300">{nSubmitted}</p>
			<p class="text-[12px] font-bold text-stone-500 dark:text-stone-400">Beadta</p>
		</div>
		<div class="rounded-2xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-stone-900">
			<p class="font-display text-[24px] font-extrabold text-brand-600 tabular-nums dark:text-white">{nFilling}</p>
			<p class="text-[12px] font-bold text-stone-500 dark:text-stone-400">Épp tölti</p>
		</div>
	</div>

	<ul class="mt-3 space-y-2">
		{#each shown as { r }, i (r.id)}
			{@const fill = filling(r)}
			{@const p = pct(r)}
			<li
				style="--d:{Math.min(i * 35, 210)}ms"
				class={['anim-rise flex items-center gap-3 rounded-2xl border bg-white p-3.5 dark:bg-stone-900', fill ? 'border-emerald-300 dark:border-emerald-500/40' : 'border-stone-200 dark:border-white/10']}
			>
				<span class="relative grid size-10 shrink-0 place-items-center rounded-full bg-stone-100 text-[15px] font-extrabold text-ink-600 uppercase dark:bg-white/10 dark:text-white">
					{r.name.trim().charAt(0)}
					{#if fill}
						<span class="absolute -top-0.5 -right-0.5 flex size-3">
							<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
							<span class="relative inline-flex size-3 rounded-full border-2 border-white bg-emerald-500 dark:border-stone-900"></span>
						</span>
					{/if}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{r.name}</span>
					<span class="block truncate text-[13px] text-stone-500 dark:text-stone-400">
						{#if fill}
							Tölti · {rel(r.open_since)} kezdte{#if r.attempts > 0} · eddigi legjobb: {r.best}{/if}
						{:else if r.attempts > 0}
							Beadva · legjobb: {r.best}/{meta.questions}{#if p !== null} ({p}%){/if}
							{#if (meta.min_score ?? 0) > 0} · {passed(r) ? 'teljesítve ✓' : 'cél alatt'}{/if}
							· {r.attempts} próbálkozás · {rel(r.last_submit)}
						{:else}
							Még nem kezdte
						{/if}
					</span>
				</span>
				{#if fill}
					<span class="shrink-0 rounded-full bg-emerald-500 px-3 py-1.5 text-[12px] font-extrabold text-white">ÉL</span>
				{:else if r.attempts > 0 && p !== null}
					<span class={['shrink-0 rounded-full px-3 py-1.5 text-[13px] font-extrabold tabular-nums', passed(r) ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300']}>
						{p}%
					</span>
				{/if}
			</li>
		{:else}
			<p class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">
				Nincs tag az osztályban.
			</p>
		{/each}
	</ul>
	<p class="mt-2 text-center text-[12px] text-stone-400 dark:text-stone-500">10 másodpercenként automatikusan frissül.</p>
{/if}

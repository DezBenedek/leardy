<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { ArrowLeft, Check, Play, Radio, SkipForward, Users } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import { gameFor } from '$lib/games/registry';
	import { studyApi, type LiveState } from '$lib/study';

	let { params } = $props();
	const code = $derived(params.code);

	let st = $state<LiveState | null>(null);
	let err = $state<string | null>(null);
	let busy = $state(false);
	let joining = $state(false);
	let now = $state(Date.now());
	let pos = $state(0);
	let ansMsg = $state<string | null>(null);
	let armFinish = $state(false);
	let doneSent = $state(false);
	let autoTriedFor = $state<string | null>(null);
	let loadSeq = 0;

	function offlineNow(): boolean {
		try {
			return typeof navigator !== 'undefined' && !navigator.onLine;
		} catch {
			return false;
		}
	}

	async function load(silent = false) {
		const mySeq = ++loadSeq;
		try {
			const fresh = await studyApi.liveState(code);
			if (mySeq !== loadSeq) return;
			st = fresh;
			if (!silent) err = null;
			else if (err && offlineNow() === false && st) err = null;
		} catch (e) {
			if (mySeq !== loadSeq) return;
			if (!st) err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	let poll: ReturnType<typeof setInterval> | undefined;
	let clock: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		poll = setInterval(() => {
			if (document.hidden || !auth.user) return;
			// Végén nincs értelme pörgetni: az eredmény statikus.
			if (st?.status === 'finished' && (st.role === 'teacher' || st.finished)) return;
			void load(true);
		}, 2500);
		clock = setInterval(() => {
			if (st?.status === 'live') now = Date.now();
		}, 1000);
	});

	onDestroy(() => {
		if (poll) clearInterval(poll);
		if (clock) clearInterval(clock);
	});

	// Egyetlen betöltési pont: kód- vagy fiókváltásra újratölt (odamenéskor friss adat,
	// nincs dupla fetch és nincs beragadt régi menet).
	$effect(() => {
		const c = code;
		void auth.user;
		st = null;
		err = null;
		pos = 0;
		doneSent = false;
		autoTriedFor = null;
		armFinish = false;
		ansMsg = null;
		void load();
	});

	// Osztálytag automatikusan bent van: nincs kódpötyögés, nincs külön "Csatlakozom"
	// gomb — a falról nyíló oldal magától becsatlakozik.
	$effect(() => {
		if (
			st?.role === 'student' && !st.joined && st.status !== 'finished' &&
			auth.user && autoTriedFor !== code && !busy && !joining
		) {
			autoTriedFor = code;
			void join();
		}
	});

	// Saját tempó: ha új kérdéssor érkezik, a pozíció ne lógjon túl.
	$effect(() => {
		if (st?.role === 'student' && st.joined && st.items) {
			if (pos >= st.items.length) pos = Math.max(0, st.items.length - 1);
		}
	});

	function remain(ts: number): number {
		return Math.max(0, Math.ceil((ts - now) / 1000));
	}

	function fmtClock(s: number): string {
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}

	async function join() {
		if (busy || joining) return;
		joining = true;
		err = null;
		try {
			await studyApi.liveJoin(code);
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			joining = false;
		}
	}

	async function start() {
		if (busy) return;
		busy = true;
		try {
			await studyApi.liveStart(code);
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	async function sendAnswer(idx: number, value: string) {
		ansMsg = null;
		try {
			await studyApi.liveAnswer(code, { idx, answer: value });
			await load(true);
		} catch (e) {
			ansMsg = e instanceof Error ? e.message : 'Hiba történt.';
			await load(true);
		}
	}

	async function advance() {
		if (busy) return;
		busy = true;
		try {
			await studyApi.liveAdvance(code);
			await load(true);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	async function finishTeacher() {
		if (!armFinish) {
			armFinish = true;
			setTimeout(() => (armFinish = false), 5000);
			return;
		}
		if (busy) return;
		busy = true;
		try {
			await studyApi.liveFinish(code);
			armFinish = false;
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	async function doDone() {
		if (busy) return;
		busy = true;
		try {
			await studyApi.liveDone(code);
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	async function doneStudent() {
		if (!armFinish) {
			armFinish = true;
			setTimeout(() => (armFinish = false), 5000);
			return;
		}
		armFinish = false;
		await doDone();
	}

	// Saját tempó: lejárt összidő → automatikus beadás (egyszer).
	$effect(() => {
		if (
			st?.role === 'student' && st.joined && st.status === 'live' &&
			st.settings?.pacing === 'self' && (st.settings.ends_at ?? 0) > 0 &&
			!st.finished && !doneSent && now >= (st.settings?.ends_at ?? 0)
		) {
			doneSent = true;
			void doDone();
		}
	});
</script>

<svelte:head>
	<title>Élő dolgozat — Leardy</title>
</svelte:head>

{#if !auth.user}
	<section class="mt-3 rounded-[24px] border border-stone-200 bg-white p-8 text-center dark:border-white/10 dark:bg-stone-900">
		<h1 class="font-display text-[22px] font-bold tracking-tight text-ink-900 dark:text-white">Élő dolgozat</h1>
		<p class="mx-auto mt-2 max-w-xs text-sm text-stone-500 dark:text-stone-400">Jelentkezz be a csatlakozáshoz.</p>
		<button
			onclick={() => authUI.show('login')}
			class="mt-5 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white"
		>
			Bejelentkezés
		</button>
	</section>
{:else if err && !st}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else if !st}
	<p class="animate-pulse mt-3 text-sm text-stone-500 dark:text-stone-400">Betöltés…</p>
{:else if st.role === 'teacher'}
	<!-- ================= TANÁR ================= -->
	{@const t = st}
	{@const parts = [...t.participants].sort((a, b) => b.live_score - a.live_score || a.name.localeCompare(b.name, 'hu'))}
	<div class="mt-3 flex items-center gap-2">
		<a
			href={t.classroom_id ? `/tanterem/${t.classroom_id}` : '/tanterem'}
			aria-label="Vissza az osztályhoz"
			class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-900 transition hover:bg-stone-50 active:scale-95 dark:hover:bg-white/10 dark:border-white/10 dark:bg-stone-900 dark:text-white"
		>
			<ArrowLeft size={20} />
		</a>
		<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">{t.title}</h1>
		{#if t.status !== 'finished'}
			<span class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-[12px] font-extrabold text-white">
				<span class="relative flex size-2">
					<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
					<span class="relative inline-flex size-2 rounded-full bg-white"></span>
				</span>
				ÉLŐ
			</span>
		{/if}
	</div>
	{#if err}
		<p role="alert" class="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
	{/if}

	{#if t.status === 'lobby'}
		<section class="mt-3 rounded-[24px] border border-stone-200 bg-white p-6 text-center sm:p-8 dark:border-white/10 dark:bg-stone-900" aria-label="Váróterem">
			<p class="text-[13px] font-extrabold tracking-[0.18em] text-stone-400 uppercase">Váróterem</p>
			<p class="font-display mt-1 text-[34px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
				Várjuk az osztályt…
			</p>
			<p class="mx-auto mt-2 max-w-xs text-sm text-stone-500 dark:text-stone-400">
				{t.settings.pacing === 'global' ? 'Te léptetsz kérdésről kérdésre' : 'Mindenki saját tempóban'} ·
				{t.settings.qmode === 'same' ? 'ugyanaz a sor' : 'kevert sorok'} ·
				{t.settings.pacing === 'global' ? `${t.settings.per_q_secs} mp/kérdés` : `${t.settings.total_mins} perc összidő`}
			</p>
			<p class="mx-auto mt-2 max-w-sm text-[13px] text-stone-400 dark:text-stone-500">
				Az osztály tagjai a falon látják az élő feladatsort és egy kattintással bent vannak — nincs kód, nincs pötyögés.
			</p>
			<div class="mx-auto mt-4 flex max-w-xs items-center justify-center gap-2 text-sm font-bold text-stone-500 dark:text-stone-400">
				<Users size={17} /> {t.participants.length} bent
			</div>
			{#if t.participants.length > 0}
				<ul class="mx-auto mt-3 flex max-w-sm flex-wrap justify-center gap-1.5">
					{#each t.participants as p (p.id)}
						<li class="anim-pop rounded-full bg-stone-100 px-3 py-1 text-[13px] font-semibold text-ink-700 dark:bg-white/10 dark:text-stone-200">
							{p.name}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-3 text-sm text-stone-400">Még senki — szólj az osztálynak, hogy a falon nyissák meg az élő feladatsort.</p>
			{/if}
			<button
				onclick={() => void start()}
				disabled={busy || t.participants.length === 0}
				class="mx-auto mt-5 flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-emerald-500 py-3.5 text-[16px] font-bold text-white transition hover:brightness-95 active:scale-[0.99] disabled:opacity-50"
			>
				<Play size={19} fill="currentColor" /> {busy ? 'Indítás…' : 'Indítás'}
			</button>
		</section>
	{:else if t.status === 'live'}
		<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900" aria-label="Vezérlés">
			<div class="flex items-center gap-3">
				<div class="min-w-0 flex-1">
					<p class="text-[13px] font-bold text-stone-500 dark:text-stone-400">
						{t.settings.pacing === 'global'
							? `${t.settings.current_idx + 1} / ${t.settings.total_q}. kérdés · ${t.answered_now} válaszolt`
							: `Összidő · ${t.participants.filter((x) => x.finished_at > 0).length}/${t.participants.length} beadta`}
					</p>
					<p class="font-display text-[30px] leading-none font-extrabold text-ink-900 tabular-nums dark:text-white">
						{t.settings.pacing === 'global'
							? fmtClock(remain(t.settings.deadline_ts))
							: fmtClock(remain(t.settings.ends_at))}
					</p>
				</div>
				{#if t.settings.pacing === 'global'}
					<button
						onclick={() => void advance()}
						disabled={busy}
						class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 active:scale-95 disabled:opacity-60"
					>
						Tovább <SkipForward size={16} />
					</button>
				{/if}
				<button
					onclick={() => void finishTeacher()}
					class={['shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition active:scale-95', armFinish ? 'bg-red-600 text-white' : 'border border-red-300 text-red-600 dark:border-red-500/40 dark:text-red-300']}
				>
					{armFinish ? 'Biztos?' : 'Lezárás'}
				</button>
			</div>
			{#if t.settings.pacing === 'global' && t.sample}
				<div class="mt-3 rounded-xl bg-stone-100 p-3.5 dark:bg-white/5">
					<p class="text-[15px] font-bold text-ink-900 dark:text-white">
						{t.sample.left ? `${t.sample.left} → ?` : t.sample.question_text}
					</p>
					{#if t.sample.options.length > 0}
						<ul class="mt-1.5 space-y-1">
							{#each t.sample.options as o (o)}
								<li class={['rounded-lg px-2.5 py-1 text-[13px] font-medium', o === t.sample?.correct_answer ? 'bg-emerald-100 font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' : 'text-stone-500 dark:text-stone-400']}>
									{o === t.sample?.correct_answer ? '✓ ' : ''}{o}
								</li>
							{/each}
						</ul>
					{:else}
						<p class="mt-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-[13px] font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
							Helyes: {t.sample.correct_answer}
						</p>
					{/if}
				</div>
			{/if}
		</section>

		<ul class="mt-3 space-y-2">
			{#each parts as p (p.id)}
				<li class="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3.5 dark:border-white/10 dark:bg-stone-900">
					<span class="grid size-10 shrink-0 place-items-center rounded-full bg-stone-100 text-[15px] font-extrabold text-ink-600 uppercase dark:bg-white/10 dark:text-white">
						{p.name.trim().charAt(0)}
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{p.name}</span>
						<span class="block text-[13px] text-stone-500 tabular-nums dark:text-stone-400">
							{p.finished_at > 0 ? `Beadta · ${p.score} pont` : `${p.answered}/${p.total} válasz · ${p.live_score} pont`}
						</span>
					</span>
					<span class="h-2.5 w-20 shrink-0 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10">
						<span
							class="block h-full rounded-full {p.finished_at > 0 ? 'bg-emerald-500' : 'bg-brand-500'}"
							style="width: {p.total > 0 ? Math.round((p.answered / p.total) * 100) : 0}%"
						></span>
					</span>
				</li>
			{/each}
		</ul>
	{:else}
		<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 text-center dark:border-white/10 dark:bg-stone-900" aria-label="Végeredmény">
			<p class="text-[13px] font-extrabold tracking-[0.18em] text-stone-400 uppercase">Vége — rangsor</p>
			<ul class="mt-3 space-y-1.5 text-left">
				{#each parts as p, i (p.id)}
					<li class="flex items-center gap-3 rounded-xl {i === 0 ? 'bg-amber-50 dark:bg-amber-400/10' : 'bg-stone-100 dark:bg-white/5'} px-3.5 py-2.5">
						<span class="w-6 shrink-0 text-center text-[15px] font-extrabold text-stone-400 tabular-nums">{i + 1}.</span>
						<span class="min-w-0 flex-1 truncate text-[15px] font-bold text-ink-900 dark:text-white">{p.name}</span>
						<span class="shrink-0 text-[15px] font-extrabold text-ink-900 tabular-nums dark:text-white">{p.score} pont</span>
					</li>
				{/each}
			</ul>
			<a
				href="/tanterem/dolgozat/{t.assignment_id}/eredmenyek"
				class="mt-4 block w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600"
			>
				Részletes eredmények
			</a>
		</section>
	{/if}
{:else}
	<!-- ================= DIÁK ================= -->
	{@const s = st}
	{@const backHref = s.classroom_id ? `/tanterem/${s.classroom_id}` : '/tanterem'}
	<div class="mt-3 flex items-center gap-2">
		<a
			href={backHref}
			aria-label="Vissza az osztályhoz"
			class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-900 transition hover:bg-stone-50 active:scale-95 dark:hover:bg-white/10 dark:border-white/10 dark:bg-stone-900 dark:text-white"
		>
			<ArrowLeft size={20} />
		</a>
		<h1 class="flex min-w-0 flex-1 items-center gap-2 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">
			<Radio size={20} class="shrink-0 text-red-500" /> Élő dolgozat
		</h1>
	</div>
	{#if err}
		<p role="alert" class="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
	{/if}

	{#if !s.joined}
		<section class="mt-3 rounded-[24px] border border-stone-200 bg-white p-6 text-center sm:p-8 dark:border-white/10 dark:bg-stone-900">
			{#if s.status === 'finished'}
				<p class="mt-3 text-sm text-stone-500 dark:text-stone-400">Ez a menet már véget ért.</p>
				<a href={backHref} class="mx-auto mt-4 block w-full max-w-xs rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white">
					Vissza az osztályhoz
				</a>
			{:else}
				<p class="text-[13px] font-extrabold tracking-[0.18em] text-stone-400 uppercase">Élő dolgozat</p>
				<p class="mt-2 text-[18px] font-extrabold text-ink-900 dark:text-white">{s.title ?? 'Élő dolgozat'}</p>
				<p class="mt-1 text-sm text-stone-500 tabular-nums dark:text-stone-400">{s.joined_n ?? 0} diák bent — automatikusan csatlakozol…</p>
				<p class="animate-pulse mt-4 text-sm font-bold text-brand-600 dark:text-brand-300">
					{joining ? 'Csatlakozás…' : err ? 'Nem sikerült — próbáld újra!' : 'Csatlakozás…'}
				</p>
				{#if err}
					<button
						onclick={() => void join()}
						disabled={joining}
						class="mx-auto mt-4 flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-brand-500 py-3.5 text-[16px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99] disabled:opacity-60"
					>
						<Users size={19} /> {joining ? 'Csatlakozás…' : 'Újrapróbálom'}
					</button>
				{/if}
			{/if}
		</section>
	{:else if s.status === 'lobby'}
		<section class="mt-3 rounded-[24px] border border-stone-200 bg-white p-8 text-center dark:border-white/10 dark:bg-stone-900" aria-label="Várakozás">
			<span class="relative mx-auto grid size-16 place-items-center rounded-full bg-brand-500 text-white">
				<span class="absolute inset-0 animate-ping rounded-full bg-brand-500/40"></span>
				<Radio size={30} class="relative" />
			</span>
			<h2 class="font-display mt-4 text-[22px] font-bold text-ink-900 dark:text-white">Bent vagy! 🎉</h2>
			<p class="mx-auto mt-1 max-w-xs text-sm text-stone-500 tabular-nums dark:text-stone-400">
				Várj, amíg a tanár elindítja… ({s.joined_n ?? 1} bent)
			</p>
		</section>
	{:else if s.status === 'live' && !s.finished}
		{@const settings = s.settings}
		{@const items = s.items ?? []}
		{@const answers = s.answers ?? {}}
		{#if settings?.pacing === 'global'}
			{@const idx = settings.current_idx}
			{@const item = items[idx]}
			<div class="mt-3 flex items-center justify-between gap-2">
				<p class="text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-400">{idx + 1} / {items.length}. kérdés</p>
				<p class="rounded-full bg-red-50 px-3 py-1 text-sm font-extrabold text-red-700 tabular-nums dark:bg-red-400/10 dark:text-red-300">
					{fmtClock(remain(settings.deadline_ts))}
				</p>
			</div>
			{#if item}
				{@const G = gameFor(item.type)}
				{@const mine = answers[item.idx]}
				<div class="mt-2 rounded-2xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-stone-900">
					<p class="text-xl font-extrabold text-ink-900 dark:text-white">
						{item.type === 'match' && item.left ? `${item.left} → ?` : item.question_text}
					</p>
				</div>
				{#if mine !== undefined}
					<p class="anim-pop mt-3 rounded-2xl bg-emerald-50 p-4 text-center text-[15px] font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
						<Check size={18} class="mr-1 inline" /> Rögzítve — várj a következő kérdésre!
					</p>
				{:else}
					<div class="mt-3" aria-label="Válaszadás">
						{#key item.idx}
							<G
								q={{ id: String(item.idx), question_text: item.question_text, type: item.type, options: item.options, left: item.left ?? undefined }}
								onAnswer={(v) => void sendAnswer(item.idx, v)}
								picked={null}
								correct={null}
							/>
						{/key}
					</div>
				{/if}
				{#if ansMsg}
					<p role="alert" class="mt-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-center text-sm font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{ansMsg}</p>
				{/if}
			{:else}
				<p class="mt-3 text-center text-sm text-stone-500">Kérdésre várunk…</p>
			{/if}
		{:else}
			{@const total = items.length}
			{@const cur = items[Math.min(pos, Math.max(0, total - 1))]}
			<div class="mt-3 flex items-center justify-between gap-2">
				<p class="text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
					{Object.keys(answers).length}/{total} kész
				</p>
				<p class="rounded-full bg-red-50 px-3 py-1 text-sm font-extrabold text-red-700 tabular-nums dark:bg-red-400/10 dark:text-red-300">
					{settings ? fmtClock(remain(settings.ends_at)) : '–'}
				</p>
			</div>
			<div class="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Kérdések">
				{#each items as it (it.idx)}
					<button
						role="tab"
						aria-selected={pos === it.idx}
						aria-label="{it.idx + 1}. kérdés{answers[it.idx] !== undefined ? ' (kész)' : ''}"
						onclick={() => (pos = it.idx)}
						class={['grid size-9 place-items-center rounded-xl text-[13px] font-extrabold tabular-nums transition active:scale-95', answers[it.idx] !== undefined ? 'bg-emerald-500 text-white' : pos === it.idx ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
					>
						{it.idx + 1}
					</button>
				{/each}
			</div>
			{#if cur}
				{@const G2 = gameFor(cur.type)}
				{@const mine2 = answers[cur.idx]}
				<div class="mt-2 rounded-2xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-stone-900">
					<p class="text-xl font-extrabold text-ink-900 dark:text-white">
						{cur.type === 'match' && cur.left ? `${cur.left} → ?` : cur.question_text}
					</p>
				</div>
				{#if mine2 !== undefined}
					<p class="anim-pop mt-3 rounded-2xl bg-emerald-50 p-4 text-center text-[15px] font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
						<Check size={18} class="mr-1 inline" /> Rögzítve ✓
					</p>
				{:else}
					<div class="mt-3" aria-label="Válaszadás">
						{#key cur.idx}
							<G2
								q={{ id: String(cur.idx), question_text: cur.question_text, type: cur.type, options: cur.options, left: cur.left ?? undefined }}
								onAnswer={(v) => void sendAnswer(cur.idx, v)}
								picked={null}
								correct={null}
							/>
						{/key}
					</div>
				{/if}
			{/if}
			<button
				onclick={() => void doneStudent()}
				class={['mt-4 w-full rounded-full py-3.5 text-[15px] font-bold transition active:scale-[0.99]', armFinish ? 'bg-red-600 text-white' : 'bg-ink-900 text-white hover:opacity-90 dark:bg-white dark:text-ink-900']}
			>
				{armFinish ? 'Biztosan beadom?' : 'Befejezem és beadom'}
			</button>
		{/if}
	{:else}
		<section class="mt-3 rounded-2xl border border-stone-200 bg-white p-5 text-center sm:p-6 dark:border-white/10 dark:bg-stone-900" aria-label="Eredményem">
			<p class="text-[13px] font-extrabold tracking-[0.18em] text-stone-400 uppercase">Eredményed</p>
			<p class="font-display text-[40px] font-extrabold text-ink-900 tabular-nums dark:text-white">{s.score ?? 0} / {s.total ?? 0}</p>
			{#if (s.review?.length ?? 0) > 0}
				<ul class="mt-3 space-y-1.5 text-left">
					{#each s.review ?? [] as r, i (r.idx)}
						<li class="rounded-xl px-3 py-2 text-sm {r.correct ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-300'}">
							{i + 1}. {r.left ? `${r.left} → ` : ''}{r.question_text} —
							{r.correct ? 'helyes' : `helytelen (helyes: ${r.correct_answer || '?'})`}
						</li>
					{/each}
				</ul>
			{/if}
			<a href={backHref} class="mt-4 block w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600">
				Vissza az osztályhoz
			</a>
		</section>
	{/if}
{/if}

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ChevronRight, ClipboardList, Plus } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { get as cacheGet, invalidate, peek } from '$lib/cache';
	import { studyApi, type AssessmentRow, type LessonRow, type Topic } from '$lib/study';

	let user = $derived(auth.user);
	let isTeacher = $derived((user?.role ?? 'student') === 'teacher');

	let assessments = $state<AssessmentRow[]>([]);
	let topics = $state<Topic[]>([]);
	let err = $state<string | null>(null);

	// Létrehozás (drawer — csak alapadatok, utána a részletező oldal nyílik)
	let createOpen = $state(false);
	let nTitle = $state('');
	let nTopic = $state('');
	let nMode = $state<'auto' | 'import' | 'blank'>('auto');
	let nLessons = $state<string[]>([]);
	let topicLessons = $state<LessonRow[]>([]);
	let nCount = $state(10);
	let busy = $state(false);

	async function load() {
		if (!isTeacher) return;
		err = null;
		try {
			const [a, t] = await Promise.all([
				cacheGet('assessments', () => studyApi.assessments(), 30000),
				cacheGet('topics:all', () => studyApi.topics(''), 60000)
			]);
			assessments = a.data.assessments;
			topics = t.data.topics;
		} catch (e) {
			if (assessments.length === 0) err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	onMount(() => {
		assessments = peek<{ assessments: AssessmentRow[] }>('assessments')?.assessments ?? [];
		void load();
	});

	$effect(() => {
		void auth.user;
		void load();
	});

	async function loadLessons(tid: string) {
		nLessons = [];
		topicLessons = [];
		if (!tid) return;
		try {
			topicLessons = (await studyApi.topic(tid)).lessons;
		} catch {
			// üresen marad
		}
	}

	function toggleLesson(id: string) {
		nLessons = nLessons.includes(id) ? nLessons.filter((x) => x !== id) : [...nLessons, id];
	}

	async function create() {
		if (!nTitle.trim() || busy) return;
		if (nMode !== 'blank' && !nTopic) {
			err = 'Importhez és generáláshoz válassz témakört. (Üres kvíz mehet anélkül is.)';
			return;
		}
		if (nMode === 'import' && nLessons.length === 0) {
			err = 'Importhoz válassz legalább egy leckét.';
			return;
		}
		busy = true;
		try {
			const res = await studyApi.buildAssessment({
				topic_id: nTopic,
				title: nTitle.trim(),
				max_attempts: 0,
				time_limit_mins: 0,
				shuffle: true,
				feedback_delayed: false,
				is_exam: false,
				count: nMode === 'blank' ? 0 : nCount,
				...(nMode === 'import' ? { lesson_ids: nLessons } : {})
			});
			nTitle = '';
			nLessons = [];
			createOpen = false;
			invalidate('assessments');
			await goto(`/kvizek/${res.assessment.id}`);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Kvízek — Leardy</title>
</svelte:head>

<div class="mt-3 flex items-center gap-2">
	<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Kvízek</h1>
	{#if isTeacher}
		<button
			onclick={() => {
				err = null;
				createOpen = true;
				if (nTopic) void loadLessons(nTopic);
			}}
			aria-label="Új kvíz"
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
		{#each assessments as a, i (a.id)}
			<a
				href="/kvizek/{a.id}"
				style="--d:{Math.min(i * 45, 270)}ms"
				class="anim-rise flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 transition hover:bg-stone-50 active:scale-[0.995] dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
			>
				<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white">
					<ClipboardList size={22} />
				</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{a.title}</span>
					<span class="block truncate text-[13px] text-stone-500 dark:text-stone-400">
						{a.topic_title ?? 'Nincs témakör'} · {a.items} kérdés{a.assigned > 0 ? ` · ${a.assigned} kiadás` : ''}
					</span>
				</span>
				<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
			</a>
		{:else}
			<p class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">
				Még nincs saját kvízed. Hozz létre egyet a + gombbal!
			</p>
		{/each}
	</div>
{/if}

<Drawer open={createOpen} label="Új kvíz" onClose={() => (createOpen = false)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Új kvíz</h2>
		<label class="mt-4 block text-[13px] font-semibold text-ink-900 dark:text-white" for="quiz-title">Cím</label>
		<input
			id="quiz-title"
			bind:value={nTitle}
			placeholder="Pl. Unit 3 témazáró"
			class="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
		/>
		<p class="mt-4 text-[13px] font-semibold text-ink-900 dark:text-white">Témakör <span class="font-normal text-stone-400">(opcionális)</span></p>
		<select
			bind:value={nTopic}
			onchange={() => void loadLessons(nTopic)}
			aria-label="Témakör"
			class="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-white/15 dark:bg-white/5 dark:text-white"
		>
			<option value="">Nincs témakör</option>
			{#each topics as t (t.id)}
				<option value={t.id}>{t.title}</option>
			{/each}
		</select>
		<p class="mt-4 text-[13px] font-semibold text-ink-900 dark:text-white">Forrás</p>
		<div class="mt-2 flex gap-2" role="tablist" aria-label="Forrás">
			{#each [{ id: 'auto', label: 'Generálás' }, { id: 'import', label: 'Import' }, { id: 'blank', label: 'Üres' }] as m (m.id)}
				<button
					role="tab"
					aria-selected={nMode === m.id}
					onclick={() => (nMode = m.id as typeof nMode)}
					class={['flex-1 rounded-full py-2 text-[13px] font-bold transition', nMode === m.id ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
				>
					{m.label}
				</button>
			{/each}
		</div>
		{#if nMode === 'import'}
			<div class="mt-2 grid max-h-56 gap-1.5 overflow-y-auto">
				{#each topicLessons as l (l.id)}
					<button
						onclick={() => toggleLesson(l.id)}
						aria-pressed={nLessons.includes(l.id)}
						class={['rounded-xl border px-3 py-2 text-left text-sm font-medium transition', nLessons.includes(l.id) ? 'border-brand-500 bg-brand-50 font-bold dark:bg-brand-500/15 dark:text-white' : 'border-stone-200 dark:border-white/10 dark:text-stone-300']}
					>
						{nLessons.includes(l.id) ? '✓ ' : ''}{l.title}
					</button>
				{:else}
					<p class="text-[13px] text-stone-500">Válassz témakört a leckelistához.</p>
				{/each}
			</div>
		{:else if nMode === 'auto'}
			<label class="mt-3 flex items-center gap-2 text-sm text-ink-600 dark:text-stone-300">
				Kérdésszám
				<input type="number" min="3" max="30" bind:value={nCount} class="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5 dark:text-white" />
			</label>
		{:else}
			<p class="mt-2 text-[13px] text-stone-500 dark:text-stone-400">Üres kvíz — a kérdéseket a részletező oldalon adod hozzá.</p>
		{/if}
		<button
			onclick={() => void create()}
			disabled={busy || !nTitle.trim()}
			class="mt-4 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
		>
			{busy ? 'Létrehozás…' : 'Létrehozás és megnyitás'}
		</button>
	</div>
</Drawer>

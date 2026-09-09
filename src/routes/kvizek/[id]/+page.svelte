<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ArrowLeft, ChevronRight, ClipboardList, Pencil, Plus } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { get as cacheGet, invalidate } from '$lib/cache';
	import Drawer from '$lib/components/Drawer.svelte';
	import QuestionForm, {
		blankQForm,
		pairCountOf,
		qFormFromItem,
		serializeQForm,
		typeLabel,
		validateQForm,
		type QFormValue
	} from '$lib/components/QuestionForm.svelte';
	import { studyApi, type AssessmentItem, type AssessmentRow } from '$lib/study';

	let { params } = $props();

	let user = $derived(auth.user);
	let isTeacher = $derived((user?.role ?? 'student') === 'teacher');

	let asm = $state<AssessmentRow | null>(null);
	let items = $state<AssessmentItem[]>([]);
	let err = $state<string | null>(null);
	let formErr = $state<string | null>(null);
	let loaded = $state(false);
	let busy = $state(false);

	// ---------- Drawerek ----------
	type QSheet = { mode: 'new' } | { mode: 'view' | 'edit'; item: AssessmentItem } | null;
	let qSheet = $state<QSheet>(null);
	let settingsOpen = $state(false);

	// ---------- Kérdés űrlap ----------
	let form = $state<QFormValue>(blankQForm());

	// ---------- Kvíz beállítások ----------
	let eTitle = $state('');
	let delQuizArm = $state(false);
	let delQArm = $state<string | null>(null);

	async function load() {
		if (!isTeacher) return;
		err = null;
		try {
			const d = await cacheGet(`assessment:${params.id}`, () => studyApi.assessment(params.id), 30000);
			asm = d.data.assessment;
			items = d.data.items;
			if (!eTitle) eTitle = asm.title;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			loaded = true;
		}
	}

	onMount(() => void load());

	$effect(() => {
		void auth.user;
		void load();
	});

	async function refresh() {
		invalidate(`assessment:${params.id}`);
		invalidate('assessments');
		const d = await studyApi.assessment(params.id);
		asm = d.assessment;
		items = d.items;
	}

	function openNew() {
		form = blankQForm();
		formErr = null;
		delQArm = null;
		qSheet = { mode: 'new' };
	}

	function openView(item: AssessmentItem) {
		delQArm = null;
		qSheet = { mode: 'view', item };
	}

	function startEdit(item: AssessmentItem) {
		form = qFormFromItem(item);
		formErr = null;
		delQArm = null;
		qSheet = { mode: 'edit', item };
	}

	function viewOptions(item: AssessmentItem): string[] {
		try {
			const p: unknown = JSON.parse(item.options_json);
			if (item.type === 'match' && p && typeof p === 'object' && !Array.isArray(p)) {
				const m = p as { options?: string[] };
				return Array.isArray(m.options) ? m.options.map(String) : [];
			}
			if (Array.isArray(p)) return p.map(String);
		} catch {
			// üres lista
		}
		return [];
	}

	function viewPairs(item: AssessmentItem): { left: string; right: string }[] {
		try {
			const p = JSON.parse(item.options_json) as {
				pairs?: { left?: string; right?: string }[];
				left?: string;
				answer?: string;
			};
			if (Array.isArray(p?.pairs)) {
				return p.pairs
					.map((x) => ({ left: String(x?.left ?? ''), right: String(x?.right ?? '') }))
					.filter((x) => x.left && x.right);
			}
			if (typeof p?.left === 'string') {
				return [{ left: p.left, right: item.correct_answer }];
			}
		} catch {
			// üres lista
		}
		return [];
	}

	async function saveQuestion() {
		if (!qSheet || qSheet.mode === 'view' || busy) return;
		formErr = validateQForm(form);
		if (formErr) return;
		busy = true;
		try {
			const payload = serializeQForm(form);
			if (qSheet.mode === 'new') {
				await studyApi.addAssessmentItem(params.id, payload);
			} else {
				await studyApi.updateAssessmentItem(qSheet.item.id, payload);
			}
			qSheet = null;
			await refresh();
		} catch (e) {
			formErr = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	async function removeQuestion(id: string) {
		if (delQArm !== id) {
			delQArm = id;
			setTimeout(() => {
				if (delQArm === id) delQArm = null;
			}, 5000);
			return;
		}
		try {
			await studyApi.deleteAssessmentItem(id);
			delQArm = null;
			qSheet = null;
			await refresh();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function rename() {
		if (!eTitle.trim() || busy) return;
		busy = true;
		try {
			await studyApi.updateAssessment(params.id, { title: eTitle.trim() });
			if (asm) asm = { ...asm, title: eTitle.trim() };
			invalidate('assessments');
			invalidate(`assessment:${params.id}`);
			settingsOpen = false;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	async function removeQuiz() {
		if (!delQuizArm) {
			delQuizArm = true;
			setTimeout(() => (delQuizArm = false), 5000);
			return;
		}
		try {
			await studyApi.deleteAssessment(params.id);
			invalidate('assessments');
			await goto('/kvizek');
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	function rowSub(it: AssessmentItem): string {
		if (it.type === 'match') {
			const n = pairCountOf(it);
			return n > 0 ? `Párosítós · ${n} pár` : 'Párosítós';
		}
		return typeLabel(it.type);
	}
</script>

<svelte:head>
	<title>{asm ? `${asm.title} — Kvíz` : 'Kvíz — Leardy'}</title>
</svelte:head>

<div class="mt-3 flex items-center gap-2">
	<a
		href="/kvizek"
		aria-label="Vissza a kvízekhez"
		class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-900 transition hover:bg-stone-50 active:scale-95 dark:hover:bg-white/10 dark:border-white/10 dark:bg-stone-900 dark:text-white"
	>
		<ArrowLeft size={20} />
	</a>
	<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">
		{asm ? asm.title : 'Kvíz'}
	</h1>
	{#if asm}
		<button
			onclick={openNew}
			aria-label="Új kérdés"
			class="grid size-10 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 active:scale-95"
		>
			<Plus size={20} strokeWidth={2.5} />
		</button>
		<button
			onclick={() => {
				if (asm) eTitle = asm.title;
				delQuizArm = false;
				settingsOpen = true;
			}}
			aria-label="Kvíz beállításai"
			class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-600 transition hover:bg-stone-50 active:scale-95 dark:border-white/10 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-white/10"
		>
			<Pencil size={18} />
		</button>
	{/if}
</div>

{#if !user}
	<p class="mt-3 rounded-2xl border border-stone-200 bg-white p-6 text-center text-sm dark:border-white/10 dark:bg-stone-900">Jelentkezz be!</p>
{:else if !isTeacher}
	<p class="mt-3 rounded-2xl border border-stone-200 bg-white p-6 text-center text-sm dark:border-white/10 dark:bg-stone-900">Ez tanári felület.</p>
{:else if !loaded}
	<p class="animate-pulse mt-3 text-sm text-stone-500">Betöltés…</p>
{:else if !asm}
	<p role="alert" class="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err ?? 'Nincs ilyen kvíz.'}</p>
{:else}
	{#if err}
		<p role="alert" class="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
	{/if}

	<section class="mt-3 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
		<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white">
			<ClipboardList size={22} />
		</span>
		<div class="min-w-0 flex-1">
			<p class="truncate text-[16px] font-bold text-ink-900 dark:text-white">{asm.title}</p>
			<p class="text-[13px] text-stone-500 dark:text-stone-400">
				{asm.topic_title ?? 'Nincs témakör'} · {items.length} kérdés{asm.assigned > 0 ? ` · ${asm.assigned} kiadás` : ''}
			</p>
		</div>
	</section>

	<!-- Kérdések: koppintásra drawerben a részletek -->
	<div class="mt-5 flex items-end justify-between gap-2">
		<h2 class="text-left text-[18px] font-extrabold tracking-tight text-ink-900 dark:text-white">Kérdések</h2>
		<span class="shrink-0 text-[13px] font-medium text-stone-500 tabular-nums dark:text-stone-400">{items.length} db</span>
	</div>
	<div class="mt-2.5 space-y-2">
		{#each items as it, i (it.id)}
			<button
				onclick={() => openView(it)}
				style="--d:{Math.min(i * 40, 240)}ms"
				class="anim-rise flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3.5 text-left transition hover:bg-stone-50 active:scale-[0.995] dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
			>
				<span class="grid size-7 shrink-0 place-items-center rounded-full bg-stone-100 text-[12px] font-bold text-stone-600 tabular-nums dark:bg-white/10 dark:text-stone-300">{i + 1}</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-semibold text-ink-900 dark:text-white">{it.question_text}</span>
					<span class="block text-[13px] text-stone-500 dark:text-stone-400">{rowSub(it)}</span>
				</span>
				<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
			</button>
		{:else}
			<button
				onclick={openNew}
				class="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm font-bold text-stone-500 transition hover:border-brand-500 hover:text-brand-600 dark:border-white/15 dark:text-stone-400"
			>
				<Plus size={16} /> Első kérdés hozzáadása
			</button>
		{/each}
	</div>
	{#if items.length > 0}
		<button
			onclick={openNew}
			class="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-dashed border-stone-300 py-3 text-[14px] font-bold text-stone-500 transition hover:border-brand-500 hover:text-brand-600 active:scale-[0.99] dark:border-white/15 dark:text-stone-400"
		>
			<Plus size={17} /> Új kérdés
		</button>
	{/if}
{/if}

<!-- KÉRDÉS drawer: hozzáadás + részletek + szerkesztés -->
<Drawer open={qSheet !== null} label="Kérdés" onClose={() => (qSheet = null)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		{#if qSheet}
			{#if qSheet.mode === 'view'}
				{@const item = qSheet.item}
				{@const opts = viewOptions(item)}
				{@const pairs = viewPairs(item)}
				<p class="inline-block rounded-full bg-stone-100 px-2.5 py-0.5 text-[12px] font-bold text-stone-600 dark:bg-white/10 dark:text-stone-300">
					{typeLabel(item.type)}
				</p>
				<h2 class="font-display mt-2 text-[20px] leading-snug font-bold tracking-tight text-ink-900 dark:text-white">
					{item.question_text}
				</h2>
				{#if item.type === 'match' && pairs.length > 0}
					<ul class="mt-3 space-y-1.5">
						{#each pairs as p (p.left + '→' + p.right)}
							<li class="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-sm dark:bg-white/5">
								<span class="min-w-0 flex-1 truncate font-semibold text-ink-900 dark:text-white">{p.left}</span>
								<span class="shrink-0 font-extrabold text-stone-400">→</span>
								<span class="min-w-0 flex-1 truncate text-right font-bold text-emerald-700 dark:text-emerald-300">{p.right}</span>
							</li>
						{/each}
					</ul>
				{:else}
					{#if opts.length > 0}
						<ul class="mt-3 space-y-1.5">
							{#each opts as o (o)}
								{@const isRight = item.type === 'order' ? true : o === item.correct_answer}
								<li class={['rounded-xl px-3 py-2 text-sm font-medium', isRight ? 'bg-emerald-50 font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-stone-100 text-ink-600 dark:bg-white/5 dark:text-stone-300']}>
									{isRight ? '✓ ' : ''}{o}
								</li>
							{/each}
						</ul>
						{#if item.type === 'order'}
							<p class="mt-1.5 text-[13px] text-stone-500 dark:text-stone-400">A fenti sorrend a helyes.</p>
						{/if}
					{/if}
					{#if item.type === 'text' || item.type === 'tf' || (item.type === 'choice' && opts.length === 0)}
						<p class="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
							Helyes: {item.correct_answer}
						</p>
					{/if}
				{/if}
				<div class="mt-4 flex gap-2">
					<button
						onclick={() => startEdit(item)}
						class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600"
					>
						<Pencil size={16} /> Szerkesztés
					</button>
					<button
						onclick={() => void removeQuestion(item.id)}
						class={['rounded-full px-5 py-3 text-[15px] font-bold transition', delQArm === item.id ? 'bg-red-600 text-white' : 'border border-red-300 text-red-600 dark:border-red-500/40 dark:text-red-300']}
					>
						{delQArm === item.id ? 'Biztos?' : 'Törlés'}
					</button>
				</div>
			{:else}
				<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">
					{qSheet.mode === 'new' ? 'Új kérdés' : 'Kérdés szerkesztése'}
				</h2>
				<div class="mt-3">
					<QuestionForm bind:value={form} />
				</div>
				{#if formErr}
					<p role="alert" class="mt-2.5 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{formErr}</p>
				{/if}
				<button
					onclick={() => void saveQuestion()}
					disabled={busy || !form.text.trim()}
					class="mt-4 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
				>
					{busy ? 'Mentés…' : qSheet.mode === 'new' ? 'Hozzáadás' : 'Mentés'}
				</button>
				{#if qSheet.mode === 'edit'}
					{@const eid = qSheet.item.id}
					<button
						onclick={() => void removeQuestion(eid)}
						class="mt-2 w-full rounded-full py-2.5 text-sm font-bold text-red-600 dark:text-red-300"
					>
						{delQArm === eid ? 'Biztosan törlöm?' : 'Kérdés törlése'}
					</button>
				{:else}
					<button onclick={() => (qSheet = null)} class="mt-2 w-full rounded-full py-2.5 text-sm font-bold text-stone-500 dark:text-stone-400">
						Mégse
					</button>
				{/if}
			{/if}
		{/if}
	</div>
</Drawer>

<!-- KVÍZ BEÁLLÍTÁSAI drawer -->
<Drawer open={settingsOpen} label="Kvíz beállításai" onClose={() => (settingsOpen = false)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Kvíz beállításai</h2>
		<label class="mt-4 block text-[13px] font-semibold text-ink-900 dark:text-white" for="quiz-name">Név</label>
		<input
			id="quiz-name"
			bind:value={eTitle}
			class="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
		/>
		<button
			onclick={() => void rename()}
			disabled={busy || !eTitle.trim()}
			class="mt-3 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
		>
			{busy ? 'Mentés…' : 'Átnevezés'}
		</button>
		{#if asm}
			<div class="mt-3 rounded-2xl bg-stone-100 p-4 text-[13px] text-stone-500 dark:bg-white/5 dark:text-stone-400">
				<p><span class="font-bold text-ink-900 dark:text-white">{items.length}</span> kérdés</p>
				<p class="mt-0.5"><span class="font-bold text-ink-900 dark:text-white">{asm.assigned}</span> kiadás · {asm.topic_title ?? 'nincs témakör'}</p>
			</div>
		{/if}
		<button
			onclick={() => void removeQuiz()}
			class={['mt-3 w-full rounded-full py-3 text-[15px] font-bold transition', delQuizArm ? 'bg-red-600 text-white' : 'border border-red-300 text-red-600 dark:border-red-500/40 dark:text-red-300']}
		>
			{delQuizArm ? 'Biztosan törlöm a kvízt?' : 'Kvíz törlése'}
		</button>
		{#if delQuizArm}
			<p class="mt-2 text-center text-[13px] text-stone-500">Kiadott kvízt előbb vond vissza a Tanteremben.</p>
		{/if}
	</div>
</Drawer>

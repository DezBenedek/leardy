<script lang="ts">
	import { onMount } from 'svelte';
	import { ChevronDown, ClipboardList, Plus, Trash2 } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { get as cacheGet, invalidate, peek } from '$lib/cache';
	import { studyApi, type AssessmentItem, type AssessmentRow, type Classroom, type LessonRow, type Topic } from '$lib/study';

	let user = $derived(auth.user);
	let isTeacher = $derived((user?.role ?? 'student') === 'teacher');

	let assessments = $state<AssessmentRow[]>([]);
	let topics = $state<Topic[]>([]);
	let rooms = $state<Classroom[]>([]);
	let err = $state<string | null>(null);

	// Létrehozás (drawer — csak alapadatok, utána a szerkesztő nyílik)
	let createOpen = $state(false);
	let nTitle = $state('');
	let nTopic = $state('');
	let nMode = $state<'auto' | 'import' | 'blank'>('auto');
	let nLessons = $state<string[]>([]);
	let topicLessons = $state<LessonRow[]>([]);
	let nCount = $state(10);
	let busy = $state(false);

	// Részletező + kiadás (a megosztás beállításai itt, megosztásonként)
	let openId = $state<string | null>(null);
	let items = $state<Record<string, AssessmentItem[]>>({});
	let delArm = $state<string | null>(null);
	let aClass = $state<Record<string, string>>({});
	let aDue = $state<Record<string, string>>({});
	let aAttempts = $state<Record<string, number>>({});
	let aTime = $state<Record<string, number>>({});
	let aShuffle = $state<Record<string, boolean>>({});
	let aDelayed = $state<Record<string, boolean>>({});
	let aExam = $state<Record<string, boolean>>({});
	let aMsg = $state<Record<string, string | null>>({});

	// Egyedi kérdés
	let qOpen = $state<string | null>(null);
	let qText = $state('');
	let qType = $state('choice');
	let qOptions = $state('');
	let qLeft = $state('');
	let qCorrect = $state('');

	const QTYPES = [
		{ id: 'choice', label: 'Feleletválasztós' },
		{ id: 'text', label: 'Beírós' },
		{ id: 'match', label: 'Párosítós' },
		{ id: 'order', label: 'Sorrendbe rakós' },
		{ id: 'tf', label: 'Igaz / hamis' }
	];

	async function load() {
		if (!isTeacher) return;
		err = null;
		try {
			const [a, t, c] = await Promise.all([
				cacheGet('assessments', () => studyApi.assessments(), 30000),
				cacheGet('topics:all', () => studyApi.topics(''), 60000),
				cacheGet('classrooms', () => studyApi.classrooms(), 30000)
			]);
			assessments = a.data.assessments;
			topics = t.data.topics;
			rooms = c.data.classrooms.filter((r) => r.mine === 1);
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
			await load();
			// Ugrás a szerkesztőbe: az új kvíz kinyílik (üresnél a kérdés-űrlappal).
			openId = res.assessment.id;
			if (nMode === 'blank') qOpen = res.assessment.id;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	async function toggle(id: string) {
		if (openId === id) {
			openId = null;
			return;
		}
		openId = id;
		const a = assessments.find((x) => x.id === id);
		if (a) {
			if (aClass[id] === undefined && rooms.length > 0) aClass[id] = rooms[0].id;
			if (aAttempts[id] === undefined) aAttempts[id] = a.max_attempts;
			if (aTime[id] === undefined) aTime[id] = a.time_limit_mins;
			if (aShuffle[id] === undefined) aShuffle[id] = a.shuffle === 1;
			if (aDelayed[id] === undefined) aDelayed[id] = a.feedback_delayed === 1;
			if (aExam[id] === undefined) aExam[id] = a.is_exam === 1;
		}
		if (!items[id]) {
			try {
				items[id] = (await studyApi.assessment(id)).items;
			} catch (e) {
				err = e instanceof Error ? e.message : 'Hiba történt.';
			}
		}
	}

	async function remove(id: string) {
		if (delArm !== id) {
			delArm = id;
			setTimeout(() => {
				if (delArm === id) delArm = null;
			}, 5000);
			return;
		}
		try {
			await studyApi.deleteAssessment(id);
			delArm = null;
			if (openId === id) openId = null;
			invalidate('assessments');
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	function lines(s: string): string[] {
		return s
			.split('\n')
			.map((x) => x.trim())
			.filter(Boolean);
	}

	async function addItem(aid: string) {
		try {
			await studyApi.addAssessmentItem(aid, {
				question_text: qText.trim(),
				type: qType,
				options: lines(qOptions),
				left: qLeft.trim(),
				correct_answer: qCorrect.trim()
			});
			qText = '';
			qOptions = '';
			qLeft = '';
			qCorrect = '';
			qOpen = null;
			items[aid] = (await studyApi.assessment(aid)).items;
			invalidate('assessments');
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function removeItem(aid: string, iid: string) {
		try {
			await studyApi.deleteAssessmentItem(iid);
			items[aid] = (await studyApi.assessment(aid)).items;
			invalidate('assessments');
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function assign(aid: string) {
		const cid = aClass[aid] ?? rooms[0]?.id ?? '';
		if (!cid) {
			aMsg[aid] = 'Nincs osztályod — hozz létre egyet a Tanteremben!';
			return;
		}
		try {
			const due = aDue[aid] ? new Date(aDue[aid]).getTime() : 0;
			await studyApi.assign({
				assessment_id: aid,
				classroom_id: cid,
				due_date: due,
				max_attempts: aAttempts[aid] ?? 0,
				time_limit_mins: aTime[aid] ?? 0,
				shuffle: aShuffle[aid] ?? true,
				feedback_delayed: aDelayed[aid] ?? false,
				is_exam: aExam[aid] ?? false
			});
			aMsg[aid] = 'Kiadva!';
			invalidate('assignments');
		} catch (e) {
			aMsg[aid] = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	const input =
		'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white';
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
			<article
				style="--d:{Math.min(i * 45, 270)}ms"
				class="anim-rise rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900"
			>
				<button onclick={() => void toggle(a.id)} class="flex w-full items-center gap-2.5 text-left">
					<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white">
						<ClipboardList size={20} />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{a.title}</span>
						<span class="block truncate text-[13px] text-stone-500 dark:text-stone-400">
							{a.topic_title ?? 'Nincs témakör'} · {a.items} kérdés{a.assigned > 0 ? ` · ${a.assigned} kiadás` : ''}
						</span>
					</span>
					<ChevronDown size={18} class={['shrink-0 text-stone-400 transition-transform', openId === a.id ? 'rotate-180' : '']} />
				</button>

				{#if openId === a.id}
					<div class="mt-3 space-y-1.5 border-t border-stone-100 pt-3 dark:border-white/5">
						{#each items[a.id] ?? [] as it (it.id)}
							<div class="flex items-center gap-2 rounded-xl bg-stone-50 px-2.5 py-2 dark:bg-white/5">
								<p class="min-w-0 flex-1 truncate text-sm dark:text-white">{it.question_text}</p>
								<button
									onclick={() => void removeItem(a.id, it.id)}
									aria-label="Kérdés törlése"
									class="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 hover:text-red-600 dark:hover:text-red-300"
								>
									<Trash2 size={14} />
								</button>
							</div>
						{:else}
							<p class="text-[13px] text-stone-500">Még nincs kérdés — adj hozzá egyet!</p>
						{/each}

						{#if qOpen === a.id}
							<div class="grid gap-1.5 rounded-xl border border-dashed border-stone-300 p-2.5 dark:border-white/15">
								<input bind:value={qText} placeholder="Kérdés szövege" aria-label="Kérdés" class={input} />
								<div class="flex gap-1.5">
									<select bind:value={qType} aria-label="Típus" class="{input} flex-1">
										{#each QTYPES as t (t.id)}
											<option value={t.id}>{t.label}</option>
										{/each}
									</select>
									{#if qType !== 'tf'}
										<input bind:value={qCorrect} placeholder="Helyes válasz" aria-label="Helyes válasz" class="{input} flex-1" />
									{/if}
								</div>
								{#if qType === 'match'}
									<input bind:value={qLeft} placeholder="Bal oldal (pl. 1526)" aria-label="Bal oldal" class={input} />
								{/if}
								{#if qType === 'choice' || qType === 'match' || qType === 'order'}
									<textarea bind:value={qOptions} rows="2" placeholder="Opciók, soronként" aria-label="Opciók" class="{input} font-mono"></textarea>
								{/if}
								<div class="flex gap-2">
									<button onclick={() => void addItem(a.id)} class="flex-1 rounded-full bg-brand-500 py-1.5 text-[13px] font-bold text-white">Hozzáadás</button>
									<button onclick={() => (qOpen = null)} class="rounded-full border border-stone-300 px-3 py-1.5 text-[13px] dark:border-white/15 dark:text-stone-300">Mégse</button>
								</div>
							</div>
						{:else}
							<button
								onclick={() => (qOpen = a.id)}
								class="flex w-full items-center justify-center gap-1 rounded-full border border-dashed border-stone-300 py-2 text-[13px] font-bold text-stone-500 dark:border-white/15 dark:text-stone-400"
							>
								<Plus size={14} /> Egyedi kérdés
							</button>
						{/if}

						<!-- Megosztás: beállítások minden kiadásnál -->
						<div class="rounded-2xl bg-stone-100 p-3.5 dark:bg-white/5">
							<p class="text-[13px] font-bold text-ink-900 dark:text-white">Megosztás csoporttal</p>
							<div class="mt-2 grid gap-2 sm:grid-cols-2">
								<select bind:value={aClass[a.id]} aria-label="Osztály" class={input}>
									{#each rooms as r (r.id)}
										<option value={r.id}>{r.name}</option>
									{/each}
								</select>
								<input type="datetime-local" bind:value={aDue[a.id]} aria-label="Határidő" class={input} />
								<label class="flex items-center gap-2 text-[13px] text-ink-600 dark:text-stone-300">
									Próbálkozás
									<input type="number" min="0" max="20" bind:value={aAttempts[a.id]} class="w-16 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5 dark:text-white" />
								</label>
								<label class="flex items-center gap-2 text-[13px] text-ink-600 dark:text-stone-300">
									Idő (perc)
									<input type="number" min="0" max="180" bind:value={aTime[a.id]} class="w-16 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5 dark:text-white" />
								</label>
								<label class="flex items-center gap-1.5 text-[13px] text-ink-600 dark:text-stone-300">
									<input type="checkbox" bind:checked={aShuffle[a.id]} class="size-4 accent-brand-500" /> Keverés
								</label>
								<label class="flex items-center gap-1.5 text-[13px] text-ink-600 dark:text-stone-300">
									<input type="checkbox" bind:checked={aExam[a.id]} class="size-4 accent-red-500" /> Dolgozat
								</label>
								<label class="flex items-center gap-1.5 text-[13px] text-ink-600 sm:col-span-2 dark:text-stone-300">
									<input type="checkbox" bind:checked={aDelayed[a.id]} class="size-4 accent-brand-500" /> Eredmény csak határidő után
								</label>
							</div>
							{#if aExam[a.id] && (aAttempts[a.id] ?? 0) !== 1}
								<p class="mt-1.5 text-[13px] font-medium text-amber-700 dark:text-amber-300">
									Dolgozathoz állítsd a próbálkozást 1-re.
								</p>
							{/if}
							<div class="mt-2.5 flex gap-2">
								<button
									onclick={() => void assign(a.id)}
									class="flex-1 rounded-full bg-emerald-500 py-2 text-sm font-bold text-white"
								>
									Kiadás
								</button>
								<button
									onclick={() => void remove(a.id)}
									class={['rounded-full px-4 py-2 text-sm font-bold transition', delArm === a.id ? 'bg-red-600 text-white' : 'border border-red-300 text-red-600 dark:border-red-500/40 dark:text-red-300']}
								>
									{delArm === a.id ? 'Biztos?' : 'Törlés'}
								</button>
							</div>
							{#if aMsg[a.id]}
								<p class="mt-2 text-[13px] font-medium text-ink-600 dark:text-stone-300">{aMsg[a.id]}</p>
							{/if}
						</div>
					</div>
				{/if}
			</article>
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
			<p class="mt-2 text-[13px] text-stone-500 dark:text-stone-400">Üres kvíz — a kérdéseket a szerkesztőben adod hozzá.</p>
		{/if}
		<button
			onclick={() => void create()}
			disabled={busy || !nTitle.trim()}
			class="mt-4 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
		>
			{busy ? 'Létrehozás…' : 'Létrehozás és szerkesztés'}
		</button>
	</div>
</Drawer>

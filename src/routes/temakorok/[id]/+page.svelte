<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CheckCircle2, Circle, FileText, Pencil, Plus, Trash2, ArrowLeft, RefreshCw } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import { lookupWord } from '$lib/pronunciation';
	import { get as cacheGet, invalidate, peek } from '$lib/cache';
	import { CATEGORIES, QueuedOffline, studyApi, type LessonDetail, type LessonRow, type Topic } from '$lib/study';

	let { params } = $props();
	let topic = $state<Topic | null>(null);
	let lessons = $state<LessonRow[]>([]);
	let enrolled = $state(false);
	let mine = $state(false);
	let err = $state<string | null>(null);

	let key = $derived(`topic:${params.id}`);

	// ---------- Szerkesztés ----------
	let editing = $state(false);
	let eTitle = $state('');
	let eCat = $state('');
	let ePublic = $state(true);
	let saving = $state(false);
	let delArm = $state<string | null>(null);

	let details = $state<Record<string, LessonDetail>>({});
	let openEditor = $state<string | null>(null); // melyik lecke tartalomszerkesztője nyitva
	let editLesson = $state<string | null>(null); // melyik lecke cím/elmélet sora szerkesztődik
	let elTitle = $state('');
	let elTheory = $state('');
	let newLessonTitle = $state('');
	let showNewLesson = $state(false);

	let newCard = $state<Record<string, { front: string; back: string; ipa: string; example: string }>>({});
	let editCard = $state<string | null>(null);
	let ecFront = $state('');
	let ecBack = $state('');
	let ecIpa = $state('');
	let ecExample = $state('');
	let pronBusy = $state(false);

	let newQ = $state<Record<string, { text: string; type: string; options: string; left: string; correct: string }>>({});
	let editQ = $state<string | null>(null);
	let eqText = $state('');
	let eqType = $state('choice');
	let eqOptions = $state('');
	let eqLeft = $state('');
	let eqCorrect = $state('');

	const QTYPES = [
		{ id: 'choice', label: 'Feleletválasztós' },
		{ id: 'text', label: 'Beírós' },
		{ id: 'match', label: 'Párosítós' },
		{ id: 'order', label: 'Sorrendbe rakós' },
		{ id: 'tf', label: 'Igaz / hamis' }
	];

	function blankQ() {
		return { text: '', type: 'choice', options: '', left: '', correct: '' };
	}

	async function load() {
		err = null;
		try {
			const res = await cacheGet(key, () => studyApi.topic(params.id), 60000);
			topic = res.data.topic;
			lessons = res.data.lessons;
			enrolled = res.data.enrolled;
			mine = res.data.mine ?? false;
			if (mine && topic) {
				eTitle = topic.title;
				eCat = topic.category;
				ePublic = topic.is_public === 1;
			}
		} catch (e) {
			if (!topic) err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	onMount(() => {
		const cached = peek<{ topic: Topic; lessons: LessonRow[]; enrolled: boolean; mine?: boolean }>(key);
		if (cached) {
			topic = cached.topic;
			lessons = cached.lessons;
			enrolled = cached.enrolled;
			mine = cached.mine ?? false;
		}
		if (page.url.searchParams.get('szerkeszt') === '1') editing = true;
		void load();
	});

	async function refresh() {
		invalidate('topics');
		invalidate(key);
		invalidate('sources');
		await load();
	}

	async function enroll() {
		if (!auth.user) {
			authUI.show('login');
			return;
		}
		try {
			await studyApi.enroll(params.id);
			enrolled = true;
			invalidate('topics');
			invalidate('sources');
		} catch (e) {
			if (e instanceof QueuedOffline) {
				// Offline: sorba állt, helyben is jelöljük.
				enrolled = true;
			} else {
				err = e instanceof Error ? e.message : 'Hiba történt.';
			}
		}
	}

	function isDone(l: LessonRow): boolean {
		return (l.theory_done ?? 0) === 1 && ((l.cards_done ?? 0) === 1 || (l.quiz_done ?? 0) === 1);
	}

	// ---------- Témakör mentés / törlés ----------

	async function saveTopic() {
		if (!eTitle.trim()) return;
		saving = true;
		try {
			await studyApi.updateTopic(params.id, {
				title: eTitle.trim(),
				category: eCat,
				is_public: ePublic
			});
			editing = false;
			await refresh();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			saving = false;
		}
	}

	async function deleteTopic() {
		if (delArm !== 'topic') {
			delArm = 'topic';
			setTimeout(() => {
				if (delArm === 'topic') delArm = null;
			}, 5000);
			return;
		}
		try {
			await studyApi.deleteTopic(params.id);
			invalidate('topics');
			invalidate('sources');
			invalidate('stats');
			await goto('/temakorok');
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	// ---------- Leckék ----------

	async function loadDetails() {
		const missing = lessons.filter((l) => !details[l.id]);
		if (missing.length === 0) return;
		try {
			const rows = await Promise.all(missing.map((l) => studyApi.lesson(l.id)));
			for (const d of rows) details[d.lesson.id] = d;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function addLesson() {
		if (!newLessonTitle.trim()) return;
		try {
			await studyApi.addLesson(params.id, { title: newLessonTitle.trim() });
			newLessonTitle = '';
			showNewLesson = false;
			await refresh();
			await loadDetails();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	function startEditLesson(l: LessonRow) {
		editLesson = l.id;
		elTitle = l.title;
		const d = details[l.id];
		elTheory = d?.lesson.description_markdown ?? '';
	}

	async function saveLesson(id: string) {
		try {
			await studyApi.updateLesson(id, { title: elTitle.trim(), description_markdown: elTheory });
			editLesson = null;
			invalidate(`lesson:${id}`);
			await refresh();
			await loadDetails();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function removeLesson(id: string) {
		if (delArm !== id) {
			delArm = id;
			setTimeout(() => {
				if (delArm === id) delArm = null;
			}, 5000);
			return;
		}
		try {
			await studyApi.deleteLesson(id);
			delArm = null;
			delete details[id];
			invalidate(`lesson:${id}`);
			invalidate('sources');
			await refresh();
			await loadDetails();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	// ---------- Kártyák ----------

	function cardForm(lid: string) {
		return (newCard[lid] ??= { front: '', back: '', ipa: '', example: '' });
	}

	/** Automatikus IPA + példamondat az idegen szóhoz (nyelvi témakör). */
	async function autoCardPron(
		foreign: string,
		curIpa: string,
		curExample: string,
		apply: (ipa: string | null, example: string | null) => void,
		force = false
	) {
		if (topic?.type !== 'language' || pronBusy) return;
		if (!foreign.trim()) return;
		if (!force && (curIpa.trim() || curExample.trim())) return;
		pronBusy = true;
		try {
			const meta = await lookupWord(foreign, topic?.category ?? '');
			apply(
				meta.ipa && (!curIpa.trim() || force) ? meta.ipa : null,
				meta.example && (!curExample.trim() || force) ? meta.example : null
			);
		} finally {
			pronBusy = false;
		}
	}

	async function addCard(lid: string) {
		const f = cardForm(lid);
		if (!f.front.trim() || !f.back.trim()) return;
		try {
			// Nyelveknél az irány: elöl a magyar kérdés — az adatban front = idegen, back = magyar,
			// ezért a bevitelt megfordítva tároljuk.
		const lang = topic?.type === 'language';
		await studyApi.addCard(lid, {
			front_text: lang ? f.back.trim() : f.front.trim(),
			back_text: lang ? f.front.trim() : f.back.trim(),
			ipa: f.ipa.trim(),
			...(lang ? { example: f.example.trim() } : {})
		});
		newCard[lid] = { front: '', back: '', ipa: '', example: '' };
			delete details[lid];
			invalidate(`lesson:${lid}`);
			invalidate('sources');
			details[lid] = await studyApi.lesson(lid);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	function startEditCard(lid: string, cid: string, front: string, back: string, ipa: string | null, example: string | null) {
		const lang = topic?.type === 'language';
		editCard = cid;
		ecFront = lang ? back : front;
		ecBack = lang ? front : back;
		ecIpa = ipa ?? '';
		ecExample = example ?? '';
		void lid;
	}

	async function saveCard(lid: string, cid: string) {
		const lang = topic?.type === 'language';
		try {
			await studyApi.updateCard(cid, {
				front_text: lang ? ecBack.trim() : ecFront.trim(),
				back_text: lang ? ecFront.trim() : ecBack.trim(),
				ipa: ecIpa.trim(),
				...(lang ? { example: ecExample.trim() } : {})
			});
			editCard = null;
			delete details[lid];
			invalidate(`lesson:${lid}`);
			invalidate('sources');
			details[lid] = await studyApi.lesson(lid);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function removeCard(lid: string, cid: string) {
		if (delArm !== cid) {
			delArm = cid;
			setTimeout(() => {
				if (delArm === cid) delArm = null;
			}, 5000);
			return;
		}
		try {
			await studyApi.deleteCard(cid);
			delArm = null;
			delete details[lid];
			invalidate(`lesson:${lid}`);
			invalidate('sources');
			details[lid] = await studyApi.lesson(lid);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	// ---------- Kvízkérdések ----------

	function qForm(lid: string) {
		return (newQ[lid] ??= blankQ());
	}

	function lines(s: string): string[] {
		return s
			.split('\n')
			.map((x) => x.trim())
			.filter(Boolean);
	}

	function prefillQ(lid: string, qid: string) {
		const d = details[lid];
		const found = d?.quiz.find((x) => x.id === qid);
		if (!found) return;
		editQ = qid;
		eqText = found.question_text;
		eqType = found.type;
		eqLeft = found.left ?? '';
		eqCorrect = found.type === 'order' ? '' : found.correct_answer;
		if (found.type === 'order' || found.type === 'choice') {
			try {
				const p: unknown = JSON.parse(found.options_raw ?? '[]');
				eqOptions = Array.isArray(p) ? p.map(String).join('\n') : '';
			} catch {
				eqOptions = '';
			}
		} else if (found.type === 'match') {
			try {
				const p = JSON.parse(found.options_raw ?? '{}') as { options?: string[] };
				eqOptions = Array.isArray(p.options) ? p.options.map(String).join('\n') : '';
			} catch {
				eqOptions = '';
			}
		} else {
			eqOptions = '';
		}
	}

	async function addQ(lid: string) {
		const f = qForm(lid);
		try {
			await studyApi.addQuestion(lid, {
				question_text: f.text.trim(),
				type: f.type,
				options: lines(f.options),
				left: f.left.trim(),
				correct_answer: f.correct.trim()
			});
			newQ[lid] = blankQ();
			delete details[lid];
			invalidate(`lesson:${lid}`);
			details[lid] = await studyApi.lesson(lid);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function saveQ(lid: string, qid: string) {
		try {
			await studyApi.updateQuestion(qid, {
				question_text: eqText.trim(),
				type: eqType,
				options: lines(eqOptions),
				left: eqLeft.trim(),
				correct_answer: eqCorrect.trim()
			});
			editQ = null;
			delete details[lid];
			invalidate(`lesson:${lid}`);
			details[lid] = await studyApi.lesson(lid);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function removeQ(lid: string, qid: string) {
		if (delArm !== qid) {
			delArm = qid;
			setTimeout(() => {
				if (delArm === qid) delArm = null;
			}, 5000);
			return;
		}
		try {
			await studyApi.deleteQuestion(qid);
			delArm = null;
			delete details[lid];
			invalidate(`lesson:${lid}`);
			details[lid] = await studyApi.lesson(lid);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	const input =
		'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white';
</script>

<svelte:head>
	<title>{topic ? `${topic.title} — Leardy` : 'Témakör — Leardy'}</title>
</svelte:head>

{#if err && !topic}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else if topic}
<div class="mt-3 flex items-center gap-2">
	<a
		href="/temakorok"
		aria-label="Vissza a témakörökhöz"
		class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-900 transition hover:bg-stone-50 active:scale-95 dark:hover:bg-white/10 dark:border-white/10 dark:bg-stone-900 dark:text-white"
	>
		<ArrowLeft size={20} />
	</a>
	<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">{topic.title}</h1>
</div>
<div class="mt-2 flex flex-wrap items-center gap-2">
		<span class="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-500 dark:bg-white/10 dark:text-stone-300">
			{topic.category ? `${topic.category} · ` : ''}{topic.type === 'language' ? 'audió + kiejtés' : 'témakör'}
		</span>
		{#if !topic.is_public}
			<span class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">Privát</span>
		{/if}
	</div>
	{#if editing}
		<p class="mt-0.5 text-sm text-ink-600 dark:text-stone-400">{lessons.length} lecke · szerkesztés</p>
	{:else}
		<p class="mt-0.5 text-sm text-ink-600 dark:text-stone-400">{lessons.length} lecke · elmélet, kártyák és kvíz leckénként</p>
	{/if}
	<div class="mt-3 flex gap-2">
		{#if !enrolled}
			<button
				onclick={enroll}
				class="flex-1 rounded-full bg-brand-500 px-4 py-2.5 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99]"
			>
				+ Felveszem
			</button>
		{/if}
		{#if mine}
			<button
				onclick={() => {
					editing = !editing;
					if (editing) void loadDetails();
				}}
				aria-pressed={editing}
				class={['inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold transition', editing ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'border border-stone-300 text-ink-600 dark:border-white/15 dark:text-stone-300']}
			>
				<Pencil size={15} /> {editing ? 'Kész' : 'Szerkesztés'}
			</button>
		{/if}
	</div>
	{#if err}
		<p role="alert" class="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
	{/if}

	{#if editing && mine}
		<!-- Témakör adatok -->
		<section class="mt-3 space-y-2.5 rounded-2xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
			<input bind:value={eTitle} aria-label="Témakör címe" class={input} />
			<div class="flex flex-wrap gap-2">
				{#each CATEGORIES as c (c)}
					<button
						onclick={() => (eCat = c)}
						aria-pressed={eCat === c}
						class={['rounded-full px-3 py-1.5 text-[13px] font-semibold transition', eCat === c ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-white text-ink-600 dark:bg-white/10 dark:text-stone-300']}
					>
						{c}
					</button>
				{/each}
			</div>
			<label class="flex items-center gap-2 text-sm font-medium text-ink-900 dark:text-white">
				<input type="checkbox" bind:checked={ePublic} class="size-4 accent-brand-500" /> Nyilvános
			</label>
			<div class="flex gap-2">
				<button
					onclick={saveTopic}
					disabled={saving}
					class="flex-1 rounded-full bg-brand-500 py-2.5 text-sm font-bold text-white disabled:opacity-60"
				>
					{saving ? 'Mentés…' : 'Mentés'}
				</button>
				<button
					onclick={deleteTopic}
					class={['rounded-full px-4 py-2.5 text-sm font-bold transition', delArm === 'topic' ? 'bg-red-600 text-white' : 'border border-red-300 text-red-600 dark:border-red-500/40 dark:text-red-300']}
				>
					{delArm === 'topic' ? 'Biztos? Törlés!' : 'Törlés'}
				</button>
			</div>
		</section>

		<!-- Leckék szerkesztése -->
		<div class="mt-3 space-y-2.5">
			{#each lessons as l, i (l.id)}
				{@const d = details[l.id]}
				<article class="rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
					{#if editLesson === l.id}
						<input bind:value={elTitle} aria-label="Lecke címe" class={input} />
						<textarea bind:value={elTheory} rows="4" aria-label="Elmélet (markdown)" placeholder="Elmélet markdownban…" class="{input} mt-2 font-mono"></textarea>
						<div class="mt-2 flex gap-2">
							<button onclick={() => saveLesson(l.id)} class="flex-1 rounded-full bg-brand-500 py-2 text-sm font-bold text-white">Mentés</button>
							<button onclick={() => (editLesson = null)} class="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-ink-600 dark:border-white/15 dark:text-stone-300">Mégse</button>
						</div>
					{:else}
						<div class="flex items-center gap-2">
							<p class="min-w-0 flex-1 truncate text-[15px] font-bold text-ink-900 dark:text-white">{i + 1}. {l.title}</p>
							<button onclick={() => startEditLesson(l)} aria-label="Lecke szerkesztése" class="grid size-8 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-stone-100 dark:hover:bg-white/10">
								<Pencil size={16} />
							</button>
							<button onclick={() => removeLesson(l.id)} aria-label="Lecke törlése" class={['grid size-8 shrink-0 place-items-center rounded-full transition', delArm === l.id ? 'bg-red-600 text-white' : 'text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-400/10 dark:hover:text-red-300']}>
								<Trash2 size={16} />
							</button>
						</div>
					{/if}
					<div class="mt-2 flex gap-2">
						<button
							onclick={() => (openEditor = openEditor === `c:${l.id}` ? null : `c:${l.id}`)}
							class="flex-1 rounded-full bg-stone-100 py-2 text-[13px] font-bold text-ink-600 dark:bg-white/10 dark:text-stone-300"
						>
							Kártyák ({d ? d.cards.length : '…'}) {openEditor === `c:${l.id}` ? '▴' : '▾'}
						</button>
						<button
							onclick={() => (openEditor = openEditor === `q:${l.id}` ? null : `q:${l.id}`)}
							class="flex-1 rounded-full bg-stone-100 py-2 text-[13px] font-bold text-ink-600 dark:bg-white/10 dark:text-stone-300"
						>
							Kvíz ({d ? d.quiz.length : '…'}) {openEditor === `q:${l.id}` ? '▴' : '▾'}
						</button>
					</div>

					{#if openEditor === `c:${l.id}`}
						{@const f = cardForm(l.id)}
						<div class="mt-2 space-y-2 border-t border-stone-100 pt-3 dark:border-white/5">
							{#if d}
								{#each d.cards as c (c.id)}
									{@const lang = topic?.type === 'language'}
									{#if editCard === c.id}
										<div class="grid gap-1.5 rounded-xl bg-stone-50 p-2.5 dark:bg-white/5">
											<input bind:value={ecFront} aria-label={lang ? 'Magyar' : 'Kérdés'} placeholder={lang ? 'Magyar' : 'Kérdés'} class={input} />
											<input
												bind:value={ecBack}
												aria-label={lang ? 'Idegen' : 'Válasz'}
												placeholder={lang ? 'Idegen' : 'Válasz'}
												onblur={() => void autoCardPron(ecBack, ecIpa, ecExample, (ipa, ex) => {
													if (ipa) ecIpa = ipa;
													if (ex) ecExample = ex;
												})}
												class={input}
											/>
											{#if lang}
												<div class="flex items-center gap-1.5">
													<input bind:value={ecIpa} aria-label="IPA (automatikus)" placeholder="IPA — automatikus" class="{input} font-mono" />
													<button
														onclick={() => void autoCardPron(ecBack, ecIpa, ecExample, (ipa, ex) => {
															if (ipa) ecIpa = ipa;
															if (ex) ecExample = ex;
														}, true)}
														disabled={pronBusy || !ecBack.trim()}
														title="Automatikus IPA- és példamondat-keresés"
														aria-label="Automatikus IPA- és példamondat-keresés"
														class="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 transition active:scale-95 disabled:opacity-40 dark:bg-brand-500/20 dark:text-white"
													>
														<RefreshCw size={15} class={pronBusy ? 'animate-spin' : ''} />
													</button>
												</div>
												<input bind:value={ecExample} aria-label="Példamondat" placeholder="Példamondat (idegen nyelven)" class={input} />
											{/if}
											<div class="flex gap-2">
												<button onclick={() => saveCard(l.id, c.id)} class="flex-1 rounded-full bg-brand-500 py-1.5 text-[13px] font-bold text-white">Mentés</button>
												<button onclick={() => (editCard = null)} class="rounded-full border border-stone-300 px-3 py-1.5 text-[13px] dark:border-white/15 dark:text-stone-300">Mégse</button>
											</div>
										</div>
									{:else}
										<div class="flex items-center gap-2 rounded-xl bg-stone-50 px-2.5 py-2 dark:bg-white/5">
											<p class="min-w-0 flex-1 truncate text-sm dark:text-white">
												<span class="font-semibold">{lang ? c.back_text : c.front_text}</span>
												<span class="text-stone-400"> → </span>
												{lang ? c.front_text : c.back_text}
											</p>
											<button onclick={() => startEditCard(l.id, c.id, c.front_text, c.back_text, c.ipa, c.example)} aria-label="Kártya szerkesztése" class="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-stone-100 dark:hover:bg-white/10">
												<Pencil size={14} />
											</button>
											<button onclick={() => removeCard(l.id, c.id)} aria-label="Kártya törlése" class={['grid size-7 shrink-0 place-items-center rounded-full', delArm === c.id ? 'bg-red-600 px-2 text-[11px] font-bold text-white' : 'text-stone-400 hover:text-red-600 dark:hover:text-red-300']}>
												{#if delArm === c.id}Törlöm?{:else}<Trash2 size={14} />{/if}
											</button>
										</div>
									{/if}
								{/each}
							{/if}
							<div class="grid gap-1.5 rounded-xl border border-dashed border-stone-300 p-2.5 dark:border-white/15">
								<input bind:value={f.front} placeholder={topic?.type === 'language' ? 'Magyar' : 'Kérdés'} aria-label="Új kártya kérdése" class={input} />
								<input
									bind:value={f.back}
									placeholder={topic?.type === 'language' ? 'Idegen' : 'Válasz'}
									aria-label="Új kártya válasza"
									onblur={() => void autoCardPron(f.back, f.ipa, f.example, (ipa, ex) => {
										if (ipa) f.ipa = ipa;
										if (ex) f.example = ex;
									})}
									class={input}
								/>
								{#if topic?.type === 'language'}
									<div class="flex items-center gap-1.5">
										<input bind:value={f.ipa} placeholder="IPA — automatikus" aria-label="IPA" class="{input} font-mono" />
										<button
											onclick={() => void autoCardPron(f.back, f.ipa, f.example, (ipa, ex) => {
												if (ipa) f.ipa = ipa;
												if (ex) f.example = ex;
											}, true)}
											disabled={pronBusy || !f.back.trim()}
											title="Automatikus IPA- és példamondat-keresés"
											aria-label="Automatikus IPA- és példamondat-keresés"
											class="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 transition active:scale-95 disabled:opacity-40 dark:bg-brand-500/20 dark:text-white"
										>
											<RefreshCw size={15} class={pronBusy ? 'animate-spin' : ''} />
										</button>
									</div>
									<input bind:value={f.example} placeholder="Példamondat (idegen nyelven)" aria-label="Példamondat" class={input} />
								{/if}
								<button onclick={() => addCard(l.id)} class="inline-flex items-center justify-center gap-1 rounded-full bg-ink-900 py-1.5 text-[13px] font-bold text-white dark:bg-white dark:text-ink-900">
									<Plus size={14} /> Kártya
								</button>
							</div>
						</div>
					{/if}

					{#if openEditor === `q:${l.id}`}
						{@const nf = qForm(l.id)}
						<div class="mt-2 space-y-2 border-t border-stone-100 pt-3 dark:border-white/5">
							{#if d}
								{#each d.quiz as qq (qq.id)}
									{#if editQ === qq.id}
										<div class="grid gap-1.5 rounded-xl bg-stone-50 p-2.5 dark:bg-white/5">
											<input bind:value={eqText} aria-label="Kérdés" class={input} />
											<select bind:value={eqType} aria-label="Típus" class={input}>
												{#each QTYPES as t (t.id)}
													<option value={t.id}>{t.label}</option>
												{/each}
											</select>
											{#if eqType === 'match'}
												<input bind:value={eqLeft} aria-label="Bal oldal" placeholder="Bal oldal (pl. 1526)" class={input} />
											{/if}
											{#if eqType === 'choice' || eqType === 'match' || eqType === 'order'}
												<textarea bind:value={eqOptions} rows="3" aria-label="Opciók, soronként" placeholder="Opciók, soronként{eqType === 'order' ? ' (helyes sorrendben)' : ''}" class="{input} font-mono"></textarea>
											{/if}
											{#if eqType === 'tf'}
												<select bind:value={eqCorrect} aria-label="Helyes válasz" class={input}>
													<option value="Igaz">Igaz</option>
													<option value="Hamis">Hamis</option>
												</select>
											{:else}
												<input bind:value={eqCorrect} aria-label="Helyes válasz" placeholder="Helyes válasz" class={input} />
											{/if}
											<div class="flex gap-2">
												<button onclick={() => saveQ(l.id, qq.id)} class="flex-1 rounded-full bg-brand-500 py-1.5 text-[13px] font-bold text-white">Mentés</button>
												<button onclick={() => (editQ = null)} class="rounded-full border border-stone-300 px-3 py-1.5 text-[13px] dark:border-white/15 dark:text-stone-300">Mégse</button>
											</div>
										</div>
									{:else}
										<div class="flex items-center gap-2 rounded-xl bg-stone-50 px-2.5 py-2 dark:bg-white/5">
											<p class="min-w-0 flex-1 truncate text-sm dark:text-white">{qq.question_text}</p>
											<button onclick={() => prefillQ(l.id, qq.id)} aria-label="Kérdés szerkesztése" class="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-stone-100 dark:hover:bg-white/10">
												<Pencil size={14} />
											</button>
											<button onclick={() => removeQ(l.id, qq.id)} aria-label="Kérdés törlése" class={['grid size-7 shrink-0 place-items-center rounded-full', delArm === qq.id ? 'bg-red-600 px-2 text-[11px] font-bold text-white' : 'text-stone-400 hover:text-red-600 dark:hover:text-red-300']}>
												{#if delArm === qq.id}Törlöm?{:else}<Trash2 size={14} />{/if}
											</button>
										</div>
									{/if}
								{/each}
							{/if}
							<div class="grid gap-1.5 rounded-xl border border-dashed border-stone-300 p-2.5 dark:border-white/15">
								<input bind:value={nf.text} placeholder="Új kérdés szövege" aria-label="Új kérdés" class={input} />
								<div class="flex gap-1.5">
									<select bind:value={nf.type} aria-label="Típus" class="{input} flex-1">
										{#each QTYPES as t (t.id)}
											<option value={t.id}>{t.label}</option>
										{/each}
									</select>
									{#if nf.type !== 'tf'}
										<input bind:value={nf.correct} placeholder="Helyes válasz" aria-label="Helyes válasz" class="{input} flex-1" />
									{/if}
								</div>
								{#if nf.type === 'match'}
									<input bind:value={nf.left} placeholder="Bal oldal (pl. 1526)" aria-label="Bal oldal" class={input} />
								{/if}
								{#if nf.type === 'choice' || nf.type === 'match' || nf.type === 'order'}
									<textarea bind:value={nf.options} rows="2" placeholder="Opciók, soronként" aria-label="Opciók" class="{input} font-mono"></textarea>
								{/if}
								<button onclick={() => addQ(l.id)} class="inline-flex items-center justify-center gap-1 rounded-full bg-ink-900 py-1.5 text-[13px] font-bold text-white dark:bg-white dark:text-ink-900">
									<Plus size={14} /> Kérdés
								</button>
							</div>
						</div>
					{/if}
				</article>
			{/each}
			{#if showNewLesson}
				<div class="grid gap-1.5 rounded-2xl border border-dashed border-stone-300 p-3 dark:border-white/15">
					<input bind:value={newLessonTitle} placeholder="Új lecke címe" aria-label="Új lecke címe" class={input} />
					<div class="flex gap-2">
						<button onclick={addLesson} class="flex-1 rounded-full bg-brand-500 py-2 text-sm font-bold text-white">Létrehozás</button>
						<button onclick={() => (showNewLesson = false)} class="rounded-full border border-stone-300 px-4 py-2 text-sm dark:border-white/15 dark:text-stone-300">Mégse</button>
					</div>
				</div>
			{:else}
				<button
					onclick={() => (showNewLesson = true)}
					class="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-stone-300 p-3 text-sm font-semibold text-stone-500 dark:border-white/15 dark:text-stone-400"
				>
					<Plus size={16} /> Új lecke
				</button>
			{/if}
		</div>
	{:else}
		<div class="mt-3 space-y-2.5">
		{#each lessons as l, i (l.id)}
			<a
				href="/lecke/{l.id}"
				style="--d:{Math.min(i * 45, 270)}ms"
				class="anim-rise flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 transition hover:bg-stone-50 active:scale-[0.995] dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
			>
					{#if isDone(l)}
						<CheckCircle2 size={22} class="shrink-0 text-emerald-500" />
					{:else}
						<Circle size={22} class="shrink-0 text-brand-500" />
					{/if}
					<div class="min-w-0 flex-1">
						<p class="truncate text-[15px] font-semibold text-ink-900 dark:text-white">{i + 1}. {l.title}</p>
						<p class="text-[13px] text-ink-400 dark:text-stone-500">
							Elmélet · Kártyák · Kvíz{#if (l.quiz_best ?? 0) > 0} · legjobb: {l.quiz_best}%{/if}
						</p>
					</div>
					<span class="shrink-0 rounded-full bg-brand-500 px-3.5 py-1.5 text-[13px] font-semibold text-white">
						{isDone(l) ? 'Átnézés' : 'Start'}
					</span>
				</a>
			{/each}
		</div>

		<a
			href="/temakorok/{topic.id}/temazaro"
			class="mt-3 flex items-center gap-3.5 rounded-2xl bg-ink-900 p-4 transition hover:opacity-90 active:scale-[0.995]"
		>
			<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15 text-white">
				<FileText size={20} />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-[15px] font-bold text-white">Összevont témazáró</span>
				<span class="block text-[13px] text-white/70">Az összes lecke kérdése keverve</span>
			</span>
		</a>
	{/if}
{/if}

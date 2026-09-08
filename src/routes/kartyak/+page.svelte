<script lang="ts">
	import { onMount } from 'svelte';
	import { Layers, Plus } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { get as cacheGet, invalidate, peek } from '$lib/cache';
	import { CATEGORIES, studyApi, type MyCard, type MyLesson, type MyTopic } from '$lib/study';

	let user = $derived(auth.user);
	let isTeacher = $derived((user?.role ?? 'student') === 'teacher');

	let topics = $state<MyTopic[]>([]);
	let lessons = $state<MyLesson[]>([]);
	let cards = $state<MyCard[]>([]);
	let err = $state<string | null>(null);

	// Melyik csomag van kinyitva
	let openPack = $state<string | null>(null);
	let delArm = $state<string | null>(null);

	// Új csomag drawer
	let packOpen = $state(false);
	let packTitle = $state('');
	let packCat = $state<string>('');
	let packBusy = $state(false);

	// Kártya drawer: új vagy szerkesztés
	type Sheet = { kind: 'new'; lessonId: string } | { kind: 'edit'; card: MyCard } | null;
	let sheet = $state<Sheet>(null);
	let fFront = $state('');
	let fBack = $state('');
	let fIpa = $state('');
	let fLesson = $state('');

	async function load() {
		if (!isTeacher) return;
		err = null;
		try {
			const res = await cacheGet('mycards', () => studyApi.myCards(), 30000);
			topics = res.data.topics;
			lessons = res.data.lessons;
			cards = res.data.cards;
		} catch (e) {
			if (cards.length === 0 && topics.length === 0) err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	onMount(() => {
		const c = peek<{ topics: MyTopic[]; lessons: MyLesson[]; cards: MyCard[] }>('mycards');
		if (c) {
			topics = c.topics;
			lessons = c.lessons;
			cards = c.cards;
		}
		void load();
	});

	$effect(() => {
		void auth.user;
		void load();
	});

	async function refresh() {
		invalidate('mycards');
		invalidate('sources');
		await load();
	}

	function topicOf(lessonId: string) {
		return lessons.find((l) => l.id === lessonId);
	}

	function packLessons(tid: string): MyLesson[] {
		return lessons.filter((l) => l.topic_id === tid);
	}

	function siblingLessons(lessonId: string): MyLesson[] {
		const t = topicOf(lessonId);
		return t ? packLessons(t.topic_id) : [];
	}

	function packCards(tid: string): MyCard[] {
		return cards.filter((c) => c.topic_id === tid);
	}

	function isLang(topicId: string): boolean {
		return topics.find((t) => t.id === topicId)?.type === 'language';
	}

	function qWord(topicId: string): string {
		return isLang(topicId) ? 'magyar' : 'kérdés';
	}

	function aWord(topicId: string): string {
		return isLang(topicId) ? 'idegen' : 'válasz';
	}

	async function createPack() {
		if (!packTitle.trim() || packBusy) return;
		packBusy = true;
		try {
			const d = await studyApi.createDeck({ title: packTitle.trim(), category: packCat });
			packTitle = '';
			packCat = '';
			packOpen = false;
			await refresh();
			// Ugrás a szerkesztőbe: az új csomag kinyílik.
			openPack = d.topic_id;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			packBusy = false;
		}
	}

	function openNew(lessonId: string) {
		fLesson = lessonId;
		fFront = '';
		fBack = '';
		fIpa = '';
		sheet = { kind: 'new', lessonId };
	}

	function openEdit(card: MyCard) {
		const lang = isLang(card.topic_id);
		fLesson = card.lesson_id;
		fFront = lang ? card.back_text : card.front_text;
		fBack = lang ? card.front_text : card.back_text;
		fIpa = card.ipa ?? '';
		sheet = { kind: 'edit', card };
	}

	async function save() {
	 if (!sheet) return;
		try {
			if (sheet.kind === 'new') {
				const t = topicOf(fLesson || sheet.lessonId);
				const lang = t ? isLang(t.topic_id) : false;
				await studyApi.addCard(fLesson || sheet.lessonId, {
					front_text: lang ? fBack.trim() : fFront.trim(),
					back_text: lang ? fFront.trim() : fBack.trim(),
					ipa: fIpa.trim()
				});
				// Marad nyitva a gyors sorozat-bővítéshez.
				fFront = '';
				fBack = '';
				fIpa = '';
			} else {
				const lang = isLang(sheet.card.topic_id);
				await studyApi.updateCard(sheet.card.id, {
					front_text: lang ? fBack.trim() : fFront.trim(),
					back_text: lang ? fFront.trim() : fBack.trim(),
					ipa: fIpa.trim()
				});
				sheet = null;
			}
			await refresh();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
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
			await studyApi.deleteCard(id);
			delArm = null;
			sheet = null;
			await refresh();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function togglePublish(t: MyTopic) {
		try {
			await studyApi.updateTopic(t.id, { is_public: t.is_public === 1 ? false : true });
			await refresh();
			invalidate('topics');
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	function sheetTopicId(): string {
		if (!sheet) return '';
		return sheet.kind === 'new'
			? (topicOf(sheet.lessonId)?.topic_id ?? '')
			: sheet.card.topic_id;
	}

	const input =
		'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white';
</script>

<svelte:head>
	<title>Kártyák — Leardy</title>
</svelte:head>

<div class="mt-3 flex items-center gap-2">
	<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Kártyák</h1>
	{#if isTeacher}
		<button
			onclick={() => {
				err = null;
				packOpen = true;
			}}
			aria-label="Új kártyacsomag"
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
		{#each topics as t, i (t.id)}
			{@const pl = packLessons(t.id)}
			{@const pc = packCards(t.id)}
			<article
				style="--d:{Math.min(i * 45, 270)}ms"
				class="anim-rise rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900"
			>
				<button onclick={() => (openPack = openPack === t.id ? null : t.id)} class="flex w-full items-center gap-2.5 text-left" aria-expanded={openPack === t.id}>
					<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
						<Layers size={19} />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{t.title}</span>
						<span class="block truncate text-[13px] text-stone-500 tabular-nums dark:text-stone-400">
							{t.category ? `${t.category} · ` : ''}{pc.length} kártya · {t.is_public === 1 ? 'nyilvános' : 'privát'}
						</span>
					</span>
					<span class={['text-stone-400 transition-transform', openPack === t.id ? 'rotate-180' : '']}>▾</span>
				</button>

				{#if openPack === t.id}
					<div class="anim-fade mt-3 space-y-2.5 border-t border-stone-100 pt-3 dark:border-white/5">
						<div class="flex items-center gap-2">
							<button
								onclick={() => void togglePublish(t)}
								aria-pressed={t.is_public === 1}
								class={['flex-1 rounded-full py-2 text-[13px] font-bold transition', t.is_public === 1 ? 'bg-emerald-500 text-white' : 'border border-stone-300 text-ink-600 dark:border-white/15 dark:text-stone-300']}
							>
								{t.is_public === 1 ? 'Közzétéve ✓' : 'Közzététel a Felfedezésbe'}
							</button>
							<button
								onclick={() => {
									const first = pl[0];
									if (first) openNew(first.id);
								}}
								disabled={pl.length === 0}
								aria-label="Új kártya"
								class="grid size-9 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 active:scale-95 disabled:opacity-50"
							>
								<Plus size={17} strokeWidth={2.5} />
							</button>
						</div>
						{#each pl as l (l.id)}
							{@const lc = pc.filter((c) => c.lesson_id === l.id)}
							{#if pl.length > 1}
								<p class="px-1 pt-1 text-[13px] font-bold text-ink-900 dark:text-white">{l.title} · {lc.length}</p>
							{/if}
							<ul class="space-y-1.5">
								{#each lc as c (c.id)}
									{@const lang = isLang(t.id)}
									<li>
										<button
											onclick={() => openEdit(c)}
											class="flex w-full items-center gap-2 rounded-xl bg-stone-100 px-3 py-2.5 text-left transition hover:bg-stone-200/70 active:scale-[0.995] dark:bg-white/5 dark:hover:bg-white/10"
										>
											<span class="min-w-0 flex-1 truncate text-sm dark:text-white">
												<span class="font-semibold">{lang ? c.back_text : c.front_text}</span>
												<span class="text-stone-400"> → </span>
												{lang ? c.front_text : c.back_text}
											</span>
										</button>
									</li>
								{:else}
									<p class="px-1 text-[13px] text-stone-500">Még nincs kártya — a + gombbal vehetsz fel.</p>
								{/each}
							</ul>
						{/each}
					</div>
				{/if}
			</article>
		{:else}
			<p class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">
				Még nincs kártyacsomagod. Hozz létre egyet a + gombbal!
			</p>
		{/each}
	</div>
{/if}

<!-- Új csomag drawer: csak alapadatok -->
<Drawer open={packOpen} label="Új kártyacsomag" onClose={() => (packOpen = false)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Új kártyacsomag</h2>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Témakör nélkül, csak kártyák.</p>
		<label class="mt-4 block text-[13px] font-semibold text-ink-900 dark:text-white" for="pack-title">Cím</label>
		<input
			id="pack-title"
			bind:value={packTitle}
			placeholder="Pl. Unit 4 szavak"
			class="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
		/>
		<p class="mt-4 text-[13px] font-semibold text-ink-900 dark:text-white">Tantárgy <span class="font-normal text-stone-400">(opcionális)</span></p>
		<div class="mt-2 flex flex-wrap gap-2">
			<button
				onclick={() => (packCat = '')}
				aria-pressed={packCat === ''}
				class={['rounded-full px-4 py-2 text-sm font-semibold transition', packCat === '' ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
			>
				Nincs
			</button>
			{#each CATEGORIES as c (c)}
				<button
					onclick={() => (packCat = c)}
					aria-pressed={packCat === c}
					class={['rounded-full px-4 py-2 text-sm font-semibold transition', packCat === c ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
				>
					{c}
				</button>
			{/each}
		</div>
		<button
			onclick={() => void createPack()}
			disabled={packBusy || !packTitle.trim()}
			class="mt-4 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
		>
			{packBusy ? 'Létrehozás…' : 'Létrehozás'}
		</button>
	</div>
</Drawer>

<!-- Kártya drawer: új + szerkesztés -->
<Drawer open={sheet !== null} label="Kártya" onClose={() => (sheet = null)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">
			{sheet?.kind === 'edit' ? 'Kártya szerkesztése' : 'Új kártya'}
		</h2>
		{#if sheet}
			{@const tid = sheetTopicId()}
			<div class="mt-4 grid gap-2">
				<label class="text-[13px] font-semibold text-ink-900 dark:text-white">
					{qWord(tid)}{#if tid && isLang(tid)} (magyar){/if}
					<input bind:value={fFront} placeholder="…" class="mt-1 {input}" />
				</label>
				<label class="text-[13px] font-semibold text-ink-900 dark:text-white">
					{aWord(tid)}{#if tid && isLang(tid)} (idegen){/if}
					<input bind:value={fBack} placeholder="…" class="mt-1 {input}" />
				</label>
				{#if !tid || isLang(tid)}
					<label class="text-[13px] font-semibold text-ink-900 dark:text-white">
						IPA <span class="font-normal text-stone-400">(opcionális)</span>
						<input bind:value={fIpa} placeholder="/…/" class="mt-1 {input}" />
					</label>
				{/if}
				{#if sheet.kind === 'new' && siblingLessons(sheet.lessonId).length > 1}
					<label class="text-[13px] font-semibold text-ink-900 dark:text-white">
						Lecke
						<select bind:value={fLesson} class="mt-1 {input}">
							{#each siblingLessons(sheet.lessonId) as l (l.id)}
								<option value={l.id}>{l.title}</option>
							{/each}
						</select>
					</label>
				{/if}
			</div>
			{#if sheet.kind === 'new'}
				<button
					onclick={() => void save()}
					disabled={!fFront.trim() || !fBack.trim()}
					class="mt-4 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white disabled:opacity-60"
				>
					Hozzáadás
				</button>
				<button
					onclick={() => (sheet = null)}
					class="mt-2 w-full rounded-full py-2.5 text-sm font-bold text-stone-500 dark:text-stone-400"
				>
					Kész
				</button>
			{:else}
				<div class="mt-4 flex gap-2">
					<button
						onclick={() => void save()}
						disabled={!fFront.trim() || !fBack.trim()}
						class="flex-1 rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white disabled:opacity-60"
					>
						Mentés
					</button>
					{#if sheet && sheet.kind === 'edit'}
						{@const cid = sheet.card.id}
						<button
							onclick={() => void remove(cid)}
							class="rounded-full border border-red-300 px-5 py-3 text-[15px] font-bold text-red-600 dark:border-red-500/40 dark:text-red-300"
						>
							{delArm === cid ? 'Biztos?' : 'Törlés'}
						</button>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</Drawer>

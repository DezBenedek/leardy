<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowLeft, Layers, Pencil, Plus, Trash2 } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { get as cacheGet, invalidate } from '$lib/cache';
	import Drawer from '$lib/components/Drawer.svelte';
	import { studyApi, type MyCard, type MyLesson, type MyTopic } from '$lib/study';

	let { params } = $props();

	let user = $derived(auth.user);
	let isTeacher = $derived((user?.role ?? 'student') === 'teacher');

	let topic = $state<MyTopic | null>(null);
	let lessons = $state<MyLesson[]>([]);
	let cards = $state<MyCard[]>([]);
	let err = $state<string | null>(null);
	let loaded = $state(false);
	let delArm = $state<string | null>(null);

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
			const t = res.data.topics.find((x) => x.id === params.id) ?? null;
			if (!t) {
				err = 'Nincs ilyen kártyacsomagod.';
				loaded = true;
				return;
			}
			topic = t;
			lessons = res.data.lessons.filter((l) => l.topic_id === params.id);
			cards = res.data.cards.filter((c) => c.topic_id === params.id);
			if (!fLesson && lessons[0]) fLesson = lessons[0].id;
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
		invalidate('mycards');
		invalidate('sources');
		const res = await studyApi.myCards();
		topic = res.topics.find((x) => x.id === params.id) ?? topic;
		lessons = res.lessons.filter((l) => l.topic_id === params.id);
		cards = res.cards.filter((c) => c.topic_id === params.id);
	}

	function isLang(): boolean {
		return topic?.type === 'language';
	}

	function openNew(lessonId: string) {
		fLesson = lessonId;
		fFront = '';
		fBack = '';
		fIpa = '';
		sheet = { kind: 'new', lessonId };
	}

	function openEdit(card: MyCard) {
		const lang = isLang();
		fLesson = card.lesson_id;
		fFront = lang ? card.back_text : card.front_text;
		fBack = lang ? card.front_text : card.back_text;
		fIpa = card.ipa ?? '';
		sheet = { kind: 'edit', card };
	}

	async function save() {
		if (!sheet) return;
		try {
			const lang = isLang();
			if (sheet.kind === 'new') {
				await studyApi.addCard(fLesson || sheet.lessonId, {
					front_text: lang ? fBack.trim() : fFront.trim(),
					back_text: lang ? fFront.trim() : fBack.trim(),
					ipa: fIpa.trim()
				});
				fFront = '';
				fBack = '';
				fIpa = '';
			} else {
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

	async function togglePublish() {
		if (!topic) return;
		try {
			await studyApi.updateTopic(topic.id, { is_public: topic.is_public === 1 ? false : true });
			await refresh();
			invalidate('topics');
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	const input =
		'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white';
</script>

<svelte:head>
	<title>{topic ? `${topic.title} — Kártyák` : 'Kártyacsomag — Leardy'}</title>
</svelte:head>

<div class="mt-3 flex items-center gap-2">
	<a
		href="/kartyak"
		aria-label="Vissza a kártyákhoz"
		class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-900 transition hover:bg-stone-50 active:scale-95 dark:hover:bg-white/10 dark:border-white/10 dark:bg-stone-900 dark:text-white"
	>
		<ArrowLeft size={20} />
	</a>
	<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">
		{topic ? topic.title : 'Kártyacsomag'}
	</h1>
	{#if topic}
		<button
			onclick={() => {
				const first = lessons[0];
				if (first) openNew(first.id);
			}}
			disabled={lessons.length === 0}
			aria-label="Új kártya"
			class="grid size-10 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 active:scale-95 disabled:opacity-50"
		>
			<Plus size={20} strokeWidth={2.5} />
		</button>
	{/if}
</div>

{#if !user}
	<p class="mt-3 rounded-2xl border border-stone-200 bg-white p-6 text-center text-sm dark:border-white/10 dark:bg-stone-900">Jelentkezz be!</p>
{:else if !isTeacher}
	<p class="mt-3 rounded-2xl border border-stone-200 bg-white p-6 text-center text-sm dark:border-white/10 dark:bg-stone-900">Ez tanári felület.</p>
{:else if !loaded}
	<p class="animate-pulse mt-3 text-sm text-stone-500">Betöltés…</p>
{:else if !topic}
	<p role="alert" class="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err ?? 'Nincs ilyen csomag.'}</p>
{:else}
	{#if err}
		<p role="alert" class="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
	{/if}

	<section class="mt-3 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
		<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
			<Layers size={22} />
		</span>
		<div class="min-w-0 flex-1">
			<p class="truncate text-[16px] font-bold text-ink-900 dark:text-white">{topic.title}</p>
			<p class="text-[13px] text-stone-500 tabular-nums dark:text-stone-400">
				{topic.category ? `${topic.category} · ` : ''}{cards.length} kártya · {topic.is_public === 1 ? 'nyilvános' : 'privát'}
			</p>
		</div>
		<button
			onclick={() => void togglePublish()}
			aria-pressed={topic.is_public === 1}
			class={['shrink-0 rounded-full px-4 py-2 text-[13px] font-bold transition', topic.is_public === 1 ? 'bg-emerald-500 text-white' : 'border border-stone-300 text-ink-600 dark:border-white/15 dark:text-stone-300']}
		>
			{topic.is_public === 1 ? 'Közzétéve ✓' : 'Közzététel'}
		</button>
	</section>

	<section class="mt-3 space-y-3" aria-label="Kártyák">
		{#each lessons as l (l.id)}
			{@const lc = cards.filter((c) => c.lesson_id === l.id)}
			<div class="rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
				{#if lessons.length > 1}
					<p class="px-1 pb-2 text-[14px] font-bold text-ink-900 dark:text-white">{l.title} · {lc.length}</p>
				{/if}
				<ul class="space-y-1.5">
					{#each lc as c (c.id)}
						{@const lang = isLang()}
						<li class="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2.5 dark:bg-white/5">
							<button onclick={() => openEdit(c)} class="min-w-0 flex-1 truncate text-left text-sm dark:text-white">
								<span class="font-semibold">{lang ? c.back_text : c.front_text}</span>
								<span class="text-stone-400"> → </span>
								{lang ? c.front_text : c.back_text}
							</button>
							<button onclick={() => openEdit(c)} aria-label="Szerkesztés" class="grid size-8 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-stone-200 dark:hover:bg-white/10">
								<Pencil size={15} />
							</button>
							<button onclick={() => void remove(c.id)} aria-label="Törlés" class={['grid size-8 shrink-0 place-items-center rounded-full', delArm === c.id ? 'bg-red-600 px-2 text-[11px] font-bold text-white' : 'text-stone-400 hover:text-red-600']}>
								{#if delArm === c.id}Törlöm?{:else}<Trash2 size={15} />{/if}
							</button>
						</li>
					{:else}
						<p class="px-1 py-2 text-[13px] text-stone-500">Még nincs kártya — a + gombbal vehetsz fel.</p>
					{/each}
				</ul>
				<button
					onclick={() => openNew(l.id)}
					class="mt-2.5 flex w-full items-center justify-center gap-1 rounded-full border border-dashed border-stone-300 py-2 text-[13px] font-bold text-stone-500 dark:border-white/15 dark:text-stone-400"
				>
					<Plus size={14} /> Kártya ide: {l.title}
				</button>
			</div>
		{/each}
	</section>
{/if}

<Drawer open={sheet !== null} label="Kártya" onClose={() => (sheet = null)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">
			{sheet?.kind === 'edit' ? 'Kártya szerkesztése' : 'Új kártya'}
		</h2>
		{#if sheet}
			{@const lang = isLang()}
			<div class="mt-4 grid gap-2">
				<label class="text-[13px] font-semibold text-ink-900 dark:text-white">
					{lang ? 'magyar' : 'kérdés'}{#if lang} (magyar){/if}
					<input bind:value={fFront} placeholder="…" class="mt-1 {input}" />
				</label>
				<label class="text-[13px] font-semibold text-ink-900 dark:text-white">
					{lang ? 'idegen' : 'válasz'}{#if lang} (idegen){/if}
					<input bind:value={fBack} placeholder="…" class="mt-1 {input}" />
				</label>
				{#if lang}
					<label class="text-[13px] font-semibold text-ink-900 dark:text-white">
						IPA <span class="font-normal text-stone-400">(opcionális)</span>
						<input bind:value={fIpa} placeholder="/…/" class="mt-1 {input}" />
					</label>
				{/if}
				{#if sheet.kind === 'new' && lessons.length > 1}
					<label class="text-[13px] font-semibold text-ink-900 dark:text-white">
						Lecke
						<select bind:value={fLesson} class="mt-1 {input}">
							{#each lessons as l (l.id)}
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
				<button onclick={() => (sheet = null)} class="mt-2 w-full rounded-full py-2.5 text-sm font-bold text-stone-500 dark:text-stone-400">
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

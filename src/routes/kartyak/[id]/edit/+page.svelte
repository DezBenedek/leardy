<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ArrowLeft,
		BookOpen,
		BookOpenText,
		Check,
		ChevronDown,
		Landmark,
		Languages,
		Layers,
		Leaf,
		Plus,
		Settings2,
		Shapes,
		Trash2,
		X
	} from '@lucide/svelte';
	import type { DeckCardKind, LevelNode, Subject } from '$lib/curriculum';
	import { DECK_CARD_KINDS } from '$lib/curriculum';
	import { toast } from '$lib/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';

	/* Saját csomag szerkesztője külön oldalon: piszkozat + kifejezett Mentés.
	   Beállítások (név, működés, besorolás, csatolás) drawerben, kártyák alatta. */

	const deckParam = $derived(page.params.id ?? '');
	const deckId = $derived(
		deckParam.startsWith('deck:') ? deckParam.slice(5) : deckParam
	);
	const detailUrl = $derived(`/kartyak/${encodeURIComponent(deckParam)}`);

	interface CardRow {
		key: number;
		id: string | null;
		front: string;
		back: string;
		sectionSlug: string;
		orig: { front: string; back: string; section: string } | null;
	}

	const inputCls =
		'min-w-0 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 motion-reduce:transition-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500';
	const cardInputCls =
		'min-w-0 w-full rounded-xl border border-transparent bg-stone-100 px-2.5 py-2 text-[14px] font-medium text-ink-900 outline-none transition placeholder:font-normal placeholder:text-stone-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 motion-reduce:transition-none dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:bg-white/10';

	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let saving = $state(false);
	let settingsOpen = $state(false);
	let picker = $state<'subject' | 'level' | 'material' | 'lesson' | null>(null);
	let armDelete = $state(false);
	let armTimer: ReturnType<typeof setTimeout> | undefined;
	let nextKey = $state(1);

	const subjectIcons: Record<string, typeof Landmark> = {
		landmark: Landmark,
		leaf: Leaf,
		languages: Languages,
		book: BookOpenText
	};

	const pickRowBtn =
		'flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 text-left transition hover:bg-stone-50 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5';
	const optRowBtn =
		'flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100';
	const optTile = (selected: boolean) =>
		[
			'grid size-9 shrink-0 place-items-center rounded-xl',
			selected
				? 'bg-brand-500 text-white'
				: 'bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300'
		].join(' ');

	// Piszkozat (már csak kártyacsomag van, kvízfajta nélkül)
	let title = $state('');
	let cardKind = $state<DeckCardKind>('word');
	let subjectId = $state('');
	let levelId = $state('');
	let materialId = $state('');
	let lessonId = $state('');
	let cards = $state<CardRow[]>([]);
	let removedIds = $state<string[]>([]);

	// Szerver-pillanatkép a dirty-figyeléshez
	let snap = $state({
		title: '',
		cardKind: 'word' as DeckCardKind,
		subject: null as string | null,
		level: null as string | null,
		material: null as string | null,
		lesson: null as string | null
	});

	let subjects = $state<Subject[]>([]);
	let levels = $state<LevelNode[]>([]);

	let subjectTitle = $derived(subjects.find((s) => s.id === subjectId)?.title ?? '');
	let levelTitle = $derived(levels.find((l) => l.id === levelId)?.title ?? '');
	/** A szint-címke a választott tantárgytól függ ("Szint", "Évfolyam", ...). */
	let levelLabel = $derived(subjects.find((s) => s.id === subjectId)?.levelLabel || 'Szint');
	let levelLabelLow = $derived(levelLabel.toLowerCase());

	let materials = $derived(levels.find((l) => l.id === levelId)?.materials ?? []);
	let lessonOptions = $derived(materials.find((m) => m.id === materialId)?.lessons ?? []);
	let materialTitle = $derived(materials.find((m) => m.id === materialId)?.title ?? '');
	let lessonTitle = $derived(lessonOptions.find((l) => l.id === lessonId)?.title ?? '');
	let frontLabel = 'Előlap';
	let backLabel = 'Hátlap';

	function norm(s: string): string {
		return s.trim();
	}

	/** Változott-e valami a betöltött állapothoz képest? */
	let dirty = $derived.by(() => {
		if (norm(title) !== snap.title) return true;
		if (cardKind !== snap.cardKind) return true;
		if ((subjectId || null) !== snap.subject) return true;
		if ((levelId || null) !== snap.level) return true;
		if ((materialId || null) !== snap.material) return true;
		if ((lessonId || null) !== snap.lesson) return true;
		if (removedIds.length > 0) return true;
		for (const c of cards) {
			const f = norm(c.front);
			const b = norm(c.back);
			if (!c.orig) {
				if (f || b) return true;
			} else if (f !== c.orig.front || b !== c.orig.back || c.sectionSlug !== c.orig.section) {
				return true;
			}
		}
		return false;
	});

	async function readError(res: Response, fallback: string): Promise<string> {
		try {
			const j = await res.json();
			if (typeof j?.error === 'string' && j.error) return j.error;
		} catch {
			// JSON nélküli válasz
		}
		return fallback;
	}

	async function fetchSubjects() {
		try {
			const res = await fetch('/api/browse');
			const j = await res.json();
			subjects = res.ok ? (j.subjects ?? []) : [];
		} catch {
			subjects = [];
		}
	}

	async function fetchLevels(subject: string) {
		if (!subject) {
			levels = [];
			return;
		}
		try {
			const res = await fetch(`/api/browse?subject=${encodeURIComponent(subject)}`);
			const j = await res.json();
			levels = res.ok && j.tree ? (j.tree.levels ?? []) : [];
		} catch {
			levels = [];
		}
	}

	async function loadDeck() {
		loading = true;
		loadError = null;
		try {
			const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}`);
			if (!res.ok) throw new Error(await readError(res, 'Nem sikerült betölteni a csomagot.'));
			const j = await res.json();
			const d = j.deck;
			title = d.title ?? '';
			cardKind = d.cardKind === 'study' ? 'study' : 'word';
			subjectId = d.subjectId ?? '';
			levelId = d.levelId ?? '';
			materialId = d.materialId ?? '';
			lessonId = d.lessonId ?? '';
			snap = {
				title,
				cardKind,
				subject: d.subjectId ?? null,
				level: d.levelId ?? null,
				material: d.materialId ?? null,
				lesson: d.lessonId ?? null
			};
			cards = (d.cards ?? []).map(
				(c: { id: string; front: string; back: string; sectionSlug?: string }) => ({
					key: nextKey++,
					id: c.id,
					front: c.front,
					back: c.back,
					sectionSlug: c.sectionSlug ?? '',
					orig: { front: c.front, back: c.back, section: c.sectionSlug ?? '' }
				})
			);
			removedIds = [];
			await fetchLevels(subjectId);
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Nem sikerült betölteni a csomagot.';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void fetchSubjects();
	});

	$effect(() => {
		const id = deckId;
		void id;
		// Hivatalos csomag (pack:... / cards:...) nem szerkeszthető: vissza az adatlapra.
		if (!deckParam.startsWith('deck:')) {
			void goto(detailUrl);
			return;
		}
		void loadDeck();
	});

	$effect(() => {
		return () => clearTimeout(armTimer);
	});

	// Kaszkád: csak lefelé nulláz, mentés a Mentés gombbal.
	function onSubject(v: string) {
		subjectId = v;
		levelId = '';
		materialId = '';
		lessonId = '';
		for (const c of cards) c.sectionSlug = '';
		void fetchLevels(v);
	}

	function onLevel(v: string) {
		levelId = v;
		materialId = '';
		lessonId = '';
		for (const c of cards) c.sectionSlug = '';
	}

	function onMaterial(v: string) {
		materialId = v;
		lessonId = '';
		for (const c of cards) c.sectionSlug = '';
	}

	function onLesson(v: string) {
		lessonId = v;
	}

	function addRow() {
		cards = [...cards, { key: nextKey++, id: null, front: '', back: '', sectionSlug: '', orig: null }];
	}

	function removeRow(card: CardRow) {
		if (card.id) removedIds = [...removedIds, card.id];
		cards = cards.filter((c) => c.key !== card.key);
	}

	async function save() {
		if (saving || loading) return;
		if (!dirty) {
			toast.success('Nincs változás.');
			return;
		}
		const t = norm(title);
		if (!t) {
			toast.warning('Hiányzik a név', 'Add meg a csomag nevét a beállításokban!');
			settingsOpen = true;
			return;
		}
		for (const c of cards) {
			const f = norm(c.front);
			const b = norm(c.back);
			if ((f && !b) || (!f && b)) {
				toast.warning('Félbehagyott kártya', 'Minden kártya mindkét oldalát töltsd ki, vagy töröld a sort!');
				return;
			}
		}
		saving = true;
		try {
			// 1. Beállítások egyetlen PATCH-csel.
			const patch: Record<string, string | null> = {};
			if (t !== snap.title) patch.title = t;
			if (cardKind !== snap.cardKind) patch.cardKind = cardKind;
			if ((subjectId || null) !== snap.subject) patch.subjectId = subjectId || null;
			if ((levelId || null) !== snap.level) patch.levelId = levelId || null;
			if ((materialId || null) !== snap.material) patch.materialId = materialId || null;
			if ((lessonId || null) !== snap.lesson) patch.lessonId = lessonId || null;
			if (Object.keys(patch).length > 0) {
				const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(patch)
				});
				if (!res.ok) throw new Error(await readError(res, 'Nem sikerült menteni a beállításokat.'));
				snap = {
					title: t,
					cardKind,
					subject: subjectId || null,
					level: levelId || null,
					material: materialId || null,
					lesson: lessonId || null
				};
				title = t;
			}
			// 2. Törölt kártyák.
			for (const rid of [...removedIds]) {
				const res = await fetch(`/api/deck-cards/${encodeURIComponent(rid)}`, { method: 'DELETE' });
				if (!res.ok) throw new Error(await readError(res, 'Nem sikerült törölni egy kártyát.'));
				removedIds = removedIds.filter((x) => x !== rid);
			}
			// 3. Módosult kártyák.
			for (const c of cards) {
				if (!c.id || !c.orig) continue;
				const f = norm(c.front);
				const b = norm(c.back);
				if (f === c.orig.front && b === c.orig.back && c.sectionSlug === c.orig.section) continue;
				const res = await fetch(`/api/deck-cards/${encodeURIComponent(c.id)}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ front: f, back: b, sectionSlug: c.sectionSlug })
				});
				if (!res.ok) throw new Error(await readError(res, 'Nem sikerült menteni egy kártyát.'));
				c.front = f;
				c.back = b;
				c.orig = { front: f, back: b, section: c.sectionSlug };
			}
			// 4. Új kártyák sorrendben.
			for (const c of cards) {
				if (c.id || (!norm(c.front) && !norm(c.back))) continue;
				const res = await fetch('/api/deck-cards', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						deckId,
						front: norm(c.front),
						back: norm(c.back),
						sectionSlug: ''
					})
				});
				if (!res.ok) throw new Error(await readError(res, 'Nem sikerült felvenni egy kártyát.'));
				const j = await res.json();
				c.id = j.id;
				c.orig = { front: norm(c.front), back: norm(c.back), section: '' };
			}
			toast.success('Mentve.');
			void goto(detailUrl);
		} catch (e) {
			toast.error('Nem sikerült menteni', e instanceof Error ? e.message : 'Hiba történt.');
		} finally {
			saving = false;
		}
	}

	function armOrDeleteDeck() {
		if (!armDelete) {
			armDelete = true;
			clearTimeout(armTimer);
			armTimer = setTimeout(() => (armDelete = false), 5000);
			return;
		}
		void deleteDeck();
	}

	async function deleteDeck() {
		clearTimeout(armTimer);
		if (saving) return;
		saving = true;
		try {
			const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(await readError(res, 'Nem sikerült törölni a csomagot.'));
			toast.success('Csomag törölve.');
			void goto('/kartyak');
		} catch (e) {
			toast.error('Nem sikerült törölni', e instanceof Error ? e.message : 'Hiba történt.');
			armDelete = false;
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{title ? `${title} - Szerkesztés` : 'Szerkesztés'} - Leardy</title>
</svelte:head>

{#if loading}
	<div role="status" aria-label="Betöltés" class="grid gap-2.5">
		<Skeleton cls="h-7 w-1/2 rounded-lg" />
		<Skeleton cls="h-32 rounded-[20px]" />
		<Skeleton cls="h-32 rounded-[20px]" />
		<span class="sr-only">Betöltés…</span>
	</div>
{:else if loadError}
	<EmptyState title="Nem sikerült betölteni" description={loadError} />
	<div class="mt-4 flex justify-center gap-2">
		<Button variant="outline" onclick={() => void loadDeck()}>Újra</Button>
		<Button variant="ghost" onclick={() => void goto(detailUrl)}>Vissza</Button>
	</div>
{:else}
	<div class="flex items-center gap-2">
		<IconButton ariaLabel="Vissza az adatlapra" size={44} onclick={() => void goto(detailUrl)}>
			<ArrowLeft size={21} />
		</IconButton>
		<div class="min-w-0 flex-1">
			<p class="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">
				Csomag szerkesztése
			</p>
			<h1 class="font-display truncate text-[22px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
				{norm(title) || 'Névtelen csomag'}
			</h1>
		</div>
		<IconButton ariaLabel="Csomag beállításai" size={44} onclick={() => (settingsOpen = true)}>
			<Settings2 size={20} />
		</IconButton>
		<Button size="sm" disabled={!dirty || saving} busy={saving} onclick={() => void save()}>
			<Check size={16} strokeWidth={3} />
			Mentés
		</Button>
	</div>

	<div class="mt-4 flex items-center gap-2 px-1">
		<h2 class="font-display min-w-0 flex-1 text-[17px] font-extrabold tracking-tight text-ink-900 dark:text-white">
			Kártyák · {cards.length}
		</h2>
		{#if dirty}
			<span class="shrink-0 rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] font-extrabold text-amber-600 uppercase dark:text-amber-300">
				Módosítva
			</span>
		{/if}
	</div>

	{#if cards.length === 0}
		<div class="mt-2.5 rounded-[20px] border border-stone-200 bg-white p-6 text-center dark:border-white/10 dark:bg-stone-900">
			<p class="text-[15px] font-extrabold text-ink-900 dark:text-white">Még nincs kártya</p>
			<p class="mt-1 text-[13px] font-medium text-stone-500 dark:text-stone-400">
				Vedd fel az elsőt az alábbi gombbal!
			</p>
		</div>
	{:else}
		<ul class="mt-2 grid gap-1.5">
			{#each cards as card, i (card.key)}
				<li class="rounded-2xl border border-stone-200 bg-white p-2 dark:border-white/10 dark:bg-stone-900">
					<div class="flex items-center gap-1.5">
						<span
							class="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-extrabold text-brand-600 tabular-nums dark:bg-brand-500/20 dark:text-white"
							aria-hidden="true"
						>
							{i + 1}
						</span>
						<input
							bind:value={card.front}
							placeholder={frontLabel}
							aria-label="{i + 1}. kártya {frontLabel.toLowerCase()} oldala"
							class={cardInputCls}
						/>
						<input
							bind:value={card.back}
							placeholder={backLabel}
							aria-label="{i + 1}. kártya {backLabel.toLowerCase()} oldala"
							class={cardInputCls}
						/>
						<button
							type="button"
							onclick={() => removeRow(card)}
							aria-label="{i + 1}. kártya törlése"
							class="grid size-8 shrink-0 place-items-center rounded-full text-stone-300 transition hover:bg-red-50 hover:text-red-600 active:scale-95 dark:text-stone-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
						>
							<X size={15} />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<button
		type="button"
		onclick={addRow}
		class="mt-1.5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-200 py-3 text-[14px] font-extrabold text-stone-400 transition hover:border-brand-300 hover:text-brand-600 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 dark:border-white/10 dark:text-stone-500 dark:hover:border-brand-500/50 dark:hover:text-white"
	>
		<Plus size={18} strokeWidth={2.75} />
		Új kártya
	</button>
{/if}

<Drawer open={settingsOpen} label="Csomag beállításai" title="Beállítások" onClose={() => (settingsOpen = false)}>
	{#if !loading && !loadError}
		<label class="mt-2 block text-[13px] font-semibold text-ink-900 dark:text-white" for="deck-name">
			Név
			<input
				id="deck-name"
				bind:value={title}
				placeholder="Pl. Angol szavak 1"
				maxlength={80}
				class="mt-1.5 {inputCls}"
			/>
		</label>

		<p class="mt-4 text-[13px] font-semibold text-ink-900 dark:text-white">Működés</p>
		<div
			role="group"
			aria-label="Csomag típusa"
			class="mt-1.5 grid grid-cols-2 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-white/10"
		>
			{#each DECK_CARD_KINDS as o (o.id)}
				{@const selected = cardKind === o.id}
				<button
					type="button"
					aria-pressed={selected}
					onclick={() => (cardKind = o.id)}
					class={[
						'rounded-xl px-2 py-2 text-left leading-none transition active:scale-[0.97]',
						selected
							? 'bg-white shadow-sm dark:bg-stone-800 dark:shadow-black/40'
							: 'hover:bg-white/60 dark:hover:bg-white/5'
					]}
				>
					<span class="block text-[13px] font-extrabold text-ink-900 dark:text-white">{o.title}</span>
					<span class="mt-1 block text-[11px] font-medium text-stone-500 dark:text-stone-400">{o.desc}</span>
				</button>
			{/each}
		</div>

		<div class="mt-4 grid gap-2">
			<button type="button" onclick={() => (picker = 'subject')} class={pickRowBtn}>
				<span class="min-w-0 flex-1">
					<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Tantárgy</span>
					<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
						{subjectTitle || 'Válassz…'}
					</span>
				</span>
				<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
			</button>
			<button type="button" onclick={() => (picker = 'level')} disabled={!subjectId} class={pickRowBtn}>
				<span class="min-w-0 flex-1">
					<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">{levelLabel}</span>
					<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
						{levelTitle || 'Válassz…'}
					</span>
				</span>
				<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
			</button>
		</div>

		<p class="mt-4 text-[13px] font-semibold text-ink-900 dark:text-white">
			Csatolás <span class="font-normal text-stone-400 dark:text-stone-500">(opcionális)</span>
		</p>
		<div class="mt-1.5 grid gap-2">
			<button type="button" onclick={() => (picker = 'material')} disabled={!levelId} class={pickRowBtn}>
				<span class="min-w-0 flex-1">
					<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Témakör</span>
					<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
						{materialTitle || 'Nincs témakör'}
					</span>
				</span>
				<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
			</button>
			<button type="button" onclick={() => (picker = 'lesson')} disabled={!materialId} class={pickRowBtn}>
				<span class="min-w-0 flex-1">
					<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Lecke</span>
					<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
						{lessonTitle || 'Nincs lecke'}
					</span>
				</span>
				<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
			</button>
		</div>

		<div class="mt-6 border-t border-stone-200 pt-4 dark:border-white/10">
			<Button variant={armDelete ? 'danger' : 'outline'} block disabled={saving} onclick={armOrDeleteDeck}>
				<Trash2 size={16} />
				{armDelete ? 'Biztosan törlöd?' : 'Csomag törlése'}
			</Button>
			{#if armDelete}
				<p class="mt-2 text-center text-[13px] font-medium text-stone-500 dark:text-stone-400">
					Kattints újra a végleges törléshez. A kártyák is törlődnek.
				</p>
			{/if}
		</div>
	{/if}
</Drawer>

<Sheet open={picker === 'subject'} label="Tantárgy választása" title="Tantárgy" onClose={() => (picker = null)}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		<li>
			<button
				type="button"
				onclick={() => {
					onSubject('');
					picker = null;
				}}
				class={[optRowBtn, !subjectId ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={optTile(!subjectId)}><Shapes size={18} aria-hidden="true" /></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Válassz…</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Nincs besorolás</span>
				</span>
				{#if !subjectId}
					<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
				{/if}
			</button>
		</li>
		{#each subjects as s (s.id)}
			{@const SIcon = subjectIcons[s.icon] ?? Shapes}
			{@const selected = s.id === subjectId}
			<li>
				<button
					type="button"
					onclick={() => {
						onSubject(s.id);
						picker = null;
					}}
					class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={optTile(selected)}><SIcon size={18} aria-hidden="true" /></span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{s.title}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">{s.lessonCount} lecke</span>
					</span>
					{#if selected}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

<Sheet open={picker === 'level'} label="{levelLabel} választása" title={levelLabel} onClose={() => (picker = null)}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		<li>
			<button
				type="button"
				onclick={() => {
					onLevel('');
					picker = null;
				}}
				class={[optRowBtn, !levelId ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={optTile(!levelId)}><Layers size={18} aria-hidden="true" /></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Válassz…</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Nincs {levelLabelLow}</span>
				</span>
				{#if !levelId}
					<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
				{/if}
			</button>
		</li>
		{#each levels as l (l.id)}
			{@const selected = l.id === levelId}
			<li>
				<button
					type="button"
					onclick={() => {
						onLevel(l.id);
						picker = null;
					}}
					class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={[optTile(selected), 'text-[15px] font-extrabold'].join(' ')}>
						{l.title.trim().charAt(0).toUpperCase()}
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{l.title}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">{l.materials.length} tananyag</span>
					</span>
					{#if selected}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

<Sheet open={picker === 'material'} label="Témakör választása" title="Témakör" onClose={() => (picker = null)}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		<li>
			<button
				type="button"
				onclick={() => {
					onMaterial('');
					picker = null;
				}}
				class={[optRowBtn, !materialId ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={optTile(!materialId)}><Shapes size={18} aria-hidden="true" /></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Nincs témakör</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Csatolás nélkül</span>
				</span>
				{#if !materialId}
					<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
				{/if}
			</button>
		</li>
		{#each materials as m (m.id)}
			{@const selected = m.id === materialId}
			<li>
				<button
					type="button"
					onclick={() => {
						onMaterial(m.id);
						picker = null;
					}}
					class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={optTile(selected)}><BookOpenText size={18} aria-hidden="true" /></span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{m.title}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">{m.lessons.length} lecke</span>
					</span>
					{#if selected}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

<Sheet open={picker === 'lesson'} label="Lecke választása" title="Lecke" onClose={() => (picker = null)}>
	<ul class="-mx-1 mt-2 space-y-0.5">
		<li>
			<button
				type="button"
				onclick={() => {
					onLesson('');
					picker = null;
				}}
				class={[optRowBtn, !lessonId ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={optTile(!lessonId)}><Shapes size={18} aria-hidden="true" /></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Nincs lecke</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Csatolás nélkül</span>
				</span>
				{#if !lessonId}
					<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
				{/if}
			</button>
		</li>
		{#each lessonOptions as le (le.id)}
			{@const selected = le.id === lessonId}
			<li>
				<button
					type="button"
					onclick={() => {
						onLesson(le.id);
						picker = null;
					}}
					class={[optRowBtn, selected ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5']}
				>
					<span class={optTile(selected)}><BookOpen size={18} aria-hidden="true" /></span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{le.title}</span>
					</span>
					{#if selected}
						<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</Sheet>

<script lang="ts">
	import { mutationFetch } from '$lib/platform/mutation-fetch';
	import { createBackNavigation } from '$lib/platform/back-navigation';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ArrowLeft,
		Save,
		Settings2
	} from '@lucide/svelte';
	import type { DeckCardKind, LevelNode, Subject } from '$lib/curriculum/curriculum';
	import { deckCardKindLabel } from '$lib/curriculum/curriculum';
	import { cardKindForSubject } from '$lib/deck/sm2';
	import { parsePastedPairs } from '$lib/deck/deck-paste';
	import { pruneEmptyRows } from '$lib/deck/deck-rows';
	import { auth } from '$lib/state/auth.svelte';
	import { canTeach } from '$lib/admin/roles';
	import { toast } from '$lib/state/toast.svelte';
	import { invalidate } from '$lib/state/query.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import CardRows from './CardRows.svelte';
	import EditPickerSheets from './EditPickerSheets.svelte';
	import SettingsDrawer from './SettingsDrawer.svelte';
	import { fetchDeckRaw, fetchLevelsRaw as fetchLevelsData, fetchSubjectsRaw, readError } from './edit-api';
	import { backLabel, frontLabel, levelLabel, norm, type CardRow } from './edit-format';

	/* Saját csomag szerkesztője külön oldalon: piszkozat + kifejezett Mentés.
	   Beállítások (név, besorolás, publikálás) drawerben, kártyák alatta.
	   Leckéhez csatolni csak a lecke szerkesztőből lehet. */

	const deckParam = $derived(page.params.id ?? '');
	const deckId = $derived(
		deckParam.startsWith('deck:') ? deckParam.slice(5) : deckParam
	);
	const detailUrl = $derived(`/kartyak/${encodeURIComponent(deckParam)}`);

	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let saving = $state(false);
	let settingsOpen = $state(false);
	let picker = $state<'subject' | 'level' | null>(null);
	let deleteOpen = $state(false);
	let nextKey = $state(1);

	// Piszkozat (már csak kártyacsomag van, kvízfajta nélkül)
	let title = $state('');
	let cardKind = $state<DeckCardKind>('word');
	let subjectId = $state('');
	let levelId = $state('');
	let materialId = $state('');
	/** Hivatalos lecke csomag: a Kártyák felől nem szerkeszthető. */
	let officialBlocked = $state<{ lessonId: string | null } | null>(null);
	/** Tanári publikálás: mindenkinek látszik a Felfedezésben és a csatolt leckénél. */
	let isPublic = $state(false);
	let cards = $state<CardRow[]>([]);
	let removedIds = $state<string[]>([]);

	/** Publikálni csak tanár (vagy kiemelt szerep) tud, diák nem. */
	let isTeacher = $derived(
		auth.ready && canTeach(auth.user?.role, auth.user?.is_admin)
	);

	// Szerver-pillanatkép a dirty-figyeléshez
	let snap = $state({
		title: '',
		cardKind: 'word' as DeckCardKind,
		subject: null as string | null,
		level: null as string | null,
		material: null as string | null,
		isPublic: false
	});

	let subjects = $state<Subject[]>([]);
	let levels = $state<LevelNode[]>([]);

	let subjectTitle = $derived(subjects.find((s) => s.id === subjectId)?.title ?? '');
	let levelTitle = $derived(levels.find((l) => l.id === levelId)?.title ?? '');
	let levelLabelLow = $derived(levelLabel.toLowerCase());

	let materials = $derived(levels.find((l) => l.id === levelId)?.materials ?? []);
	let materialTitle = $derived(materials.find((m) => m.id === materialId)?.title ?? '');
	/** Automatikus típus a tantárgy alapján: nyelvnél Szókártya, máshol Tanulókártya. */
	let autoKindLabel = $derived(deckCardKindLabel(cardKind));

	/** Változott-e valami a betöltött állapothoz képest? */
	let dirty = $derived.by(() => {
		if (norm(title) !== snap.title) return true;
		if (cardKind !== snap.cardKind) return true;
		if (isPublic !== snap.isPublic) return true;
		if ((subjectId || null) !== snap.subject) return true;
		if ((levelId || null) !== snap.level) return true;
		if ((materialId || null) !== snap.material) return true;
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

	async function fetchSubjects() {
		subjects = await fetchSubjectsRaw();
	}

	async function fetchLevels(subject: string) {
		levels = await fetchLevelsData(subject);
	}

	async function loadDeck() {
		loading = true;
		loadError = null;
		try {
			const res = await fetchDeckRaw(deckId);
			if (!res.ok) {
				const blocked = await res.json().catch(() => ({}));
				if (res.status === 403 && blocked?.isLesson) {
					officialBlocked = { lessonId: typeof blocked.lessonId === 'string' ? blocked.lessonId : null };
					loading = false;
					return;
				}
				throw new Error(await readError(res, 'Nem sikerült betölteni a csomagot.'));
			}
			officialBlocked = null;
			const j = await res.json();
			const d = j.deck;
			title = d.title ?? '';
			cardKind = d.cardKind === 'study' ? 'study' : 'word';
			subjectId = d.subjectId ?? '';
			levelId = d.levelId ?? '';
			materialId = d.materialId ?? '';
			isPublic = d.isPublic === true;
			snap = {
				title,
				cardKind,
				subject: d.subjectId ?? null,
				level: d.levelId ?? null,
				material: d.materialId ?? null,
				isPublic
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
			ensureTrailingEmpty();
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

	// Kaszkád: csak lefelé nulláz, mentés a Mentés gombbal.
	// A típus automatikus: tantárgyváltáskor azonnal újraszámoljuk.
	function onSubject(v: string) {
		subjectId = v;
		levelId = '';
		materialId = '';
		for (const c of cards) c.sectionSlug = '';
		const subj = subjects.find((s) => s.id === v);
		cardKind = cardKindForSubject(subj?.title ?? '', subj?.icon ?? 'book', v || null);
		void fetchLevels(v);
	}

	function onLevel(v: string) {
		levelId = v;
		materialId = '';
		for (const c of cards) c.sectionSlug = '';
	}

	function onMaterial(v: string) {
		materialId = v;
		for (const c of cards) c.sectionSlug = '';
	}

	/** Mindig van egy üres sor a végén: ha az utolsóba írnak, új üres nyílik. */
	function ensureTrailingEmpty() {
		const last = cards[cards.length - 1];
		if (!last || norm(last.front) || norm(last.back)) {
			cards = [...cards, { key: nextKey++, id: null, front: '', back: '', sectionSlug: '', orig: null }];
		}
	}

	function onRowInput() {
		ensureTrailingEmpty();
	}

	/** Kitöltött kártyák száma (az üres sor nem számít). */
	let filledCount = $derived(cards.filter((c) => norm(c.front) || norm(c.back)).length);

	/** Beillesztés a vágólapról: "magyar;angol" sorok, tabbal vagy |-vonallal is.
	 *  Sima szövegnél marad az alapértelmezett beillesztés. */
	function onPasteCard(e: ClipboardEvent, card: CardRow) {
		const text = e.clipboardData?.getData('text') ?? '';
		if (!text) return;
		const pairs = parsePastedPairs(text);
		if (pairs.length === 0) return;
		// Egy elválasztó nélküli érték: alapértelmezett beillesztés a mezőbe.
		if (pairs.length === 1 && !pairs[0].back) return;
		e.preventDefault();
		const idx = cards.findIndex((c) => c.key === card.key);
		if (idx < 0) return;
		// Egy csomagban legfeljebb 200 kártya lehet: a többlet nem illeszkedik be.
		const MAX_CARDS = 200;
		const used = cards.filter((c) => c.key === card.key || norm(c.front) || norm(c.back)).length;
		let list = pairs;
		if (used + pairs.length - 1 > MAX_CARDS) {
			list = pairs.slice(0, Math.max(0, MAX_CARDS - used + 1));
			if (list.length === 0) {
				toast.warning('Betelt a csomag', 'Legfeljebb 200 kártya lehet egy csomagban.');
				return;
			}
			toast.warning('Betelt a csomag', `Csak az első ${list.length} kártya illeszkedett be.`);
		}
		const next = [...cards];
		next[idx] = { ...next[idx], front: list[0].front, back: list[0].back };
		if (list.length > 1) {
			const inserts: CardRow[] = list
				.slice(1)
				.map((p) => ({ key: nextKey++, id: null, front: p.front, back: p.back, sectionSlug: '', orig: null }));
			next.splice(idx + 1, 0, ...inserts);
			toast.success(`${list.length} kártya beillesztve.`);
		}
		cards = next;
		ensureTrailingEmpty();
		// A beillesztett sorok látszódjanak: a cél sor utáni sor a nézetbe kerül.
		requestAnimationFrame(() => {
			try {
				const rows = document.querySelectorAll('#card-rows > li');
				const el = rows[idx + 1] ?? rows[idx];
				el?.scrollIntoView({ block: 'nearest' });
			} catch {
				// görgetés nélkül is működik
			}
		});
	}

	function removeRow(card: CardRow) {
		if (cards.length <= 1) return;
		if (card.id) removedIds = [...removedIds, card.id];
		cards = cards.filter((c) => c.key !== card.key);
		ensureTrailingEmpty();
	}

	/** Új üres sor beszúrása az adott sor után, fókusszal a kifejezés mezőn. */
	function insertRowAfter(card: CardRow) {
		const idx = cards.findIndex((c) => c.key === card.key);
		if (idx < 0) return;
		const next = [...cards];
		next.splice(idx + 1, 0, { key: nextKey++, id: null, front: '', back: '', sectionSlug: '', orig: null });
		cards = next;
		requestAnimationFrame(() => {
			try {
				const rows = document.querySelectorAll('#card-rows > li');
				rows[idx + 1]?.querySelector<HTMLInputElement>('input[data-field="front"]')?.focus();
			} catch {
				// fókusz nélkül is működik
			}
		});
	}

	/** A sor elhagyásakor a teljesen kiürült sorok kikerülnek,
	    a végén pontosan egy üres sor marad. Amelyik sor éppen fókuszt kap
	    (például Enterrel beszúrt új sor), az megmarad. */
	function onRowFocusOut(e: FocusEvent) {
		const li = e.currentTarget as HTMLElement;
		if (li.contains(e.relatedTarget as Node | null)) return;
		const target = e.relatedTarget as HTMLElement | null;
		const targetKey = target?.closest?.('li[data-key]')?.getAttribute('data-key');
		const exemptKey = targetKey === null || targetKey === undefined ? null : Number(targetKey);
		const { kept, removedIds: gone, changed } = pruneEmptyRows(
			cards,
			Number.isFinite(exemptKey) ? exemptKey : null
		);
		if (!changed) return;
		if (gone.length > 0) removedIds = [...removedIds, ...gone];
		cards = kept;
		ensureTrailingEmpty();
	}

	/** Üres mezőben nyomott Backspace: fókusz az előző mező végére.
	   Üres definícióból az azonos sor kifejezésére, onnan (ha az is üres)
	   az előző sor definíciójára. Üres kifejezésből az előző sor definíciójára.
	   Definícióban nyomott Enter új sort szúr be a sor után. */
	function onCardKeydown(e: KeyboardEvent, card: CardRow, field: 'front' | 'back') {
		if (e.isComposing) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			const input = e.currentTarget as HTMLInputElement;
			if (field === 'back') {
				// Üres sorban nincs mit folytatni.
				if (norm(card.front) === '' && norm(card.back) === '') return;
				// Csak a definíció végéről szúr be új sort.
				if ((input.selectionStart ?? 0) !== input.value.length) return;
				if ((input.selectionEnd ?? 0) !== input.value.length) return;
				insertRowAfter(card);
			} else {
				const backInput = input.closest('li')?.querySelector<HTMLInputElement>('input[data-field="back"]');
				backInput?.focus();
			}
			return;
		}
		if (e.key !== 'Backspace') return;
		const input = e.currentTarget as HTMLInputElement;
		if (input.value !== '') return;
		const li = input.closest('li');
		if (!li) return;
		const atEnd = (el: HTMLInputElement) => {
			el.focus();
			try {
				el.setSelectionRange(el.value.length, el.value.length);
			} catch {
				// nem szöveges mező: csak a fókusz számít
			}
		};
		if (field === 'back') {
			e.preventDefault();
			const frontInput = li.querySelector<HTMLInputElement>('input[data-field="front"]');
			if (frontInput && norm(frontInput.value) !== '') {
				atEnd(frontInput);
				return;
			}
			const prev = li.previousElementSibling as HTMLElement | null;
			const prevBack = prev?.querySelector<HTMLInputElement>('input[data-field="back"]');
			if (prevBack) atEnd(prevBack);
		} else {
			const prev = li.previousElementSibling as HTMLElement | null;
			const prevBack = prev?.querySelector<HTMLInputElement>('input[data-field="back"]');
			if (prevBack) {
				e.preventDefault();
				atEnd(prevBack);
			}
		}
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
		const filledCards = cards.filter((c) => norm(c.front) && norm(c.back));
		if (isPublic && filledCards.length === 0) {
			toast.warning('Üres csomag', 'Publikáláshoz adj meg legalább egy kitöltött kártyát!');
			return;
		}
		saving = true;
		try {
		// 1. Beállítások egyetlen PATCH-csel. A típus automatikus,
		// ezért cardKind nem megy: a tantárgy dönti el a szerveren is.
		// Publikálás csak tanárnak megy: diák mentése ezt nem érinti.
		// Leckéhez csatolni csak a lecke szerkesztőből lehet.
		const patch: Record<string, string | boolean | null> = {};
		if (t !== snap.title) patch.title = t;
		if ((subjectId || null) !== snap.subject) patch.subjectId = subjectId || null;
			if ((levelId || null) !== snap.level) patch.levelId = levelId || null;
			if ((materialId || null) !== snap.material) patch.materialId = materialId || null;
			if (isTeacher && isPublic !== snap.isPublic) patch.isPublic = isPublic;
			if (Object.keys(patch).length > 0) {
				const res = await mutationFetch(`/api/decks/${encodeURIComponent(deckId)}`, {
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
				isPublic
			};
			// Tantárgyváltás után a szerver automatikus típusát vesszük át.
			try {
				const subj = subjects.find((s) => s.id === subjectId);
				cardKind = cardKindForSubject(subj?.title ?? '', subj?.icon ?? 'book', subjectId || null);
				snap.cardKind = cardKind;
			} catch {
				// marad a helyi érték
			}
				title = t;
			}
			// 2. Törölt kártyák egyetlen kérésben.
			if (removedIds.length > 0) {
				const res = await mutationFetch('/api/deck-cards', {
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ deckId, ids: removedIds })
				});
				if (!res.ok) throw new Error(await readError(res, 'Nem sikerült törölni egy kártyát.'));
				removedIds = [];
			}
			// 3. Módosult kártyák egyetlen kérésben.
			const changed = cards.filter((c) => {
				if (!c.id || !c.orig) return false;
				const f = norm(c.front);
				const b = norm(c.back);
				return f !== c.orig.front || b !== c.orig.back || c.sectionSlug !== c.orig.section;
			});
			if (changed.length > 0) {
				const res = await mutationFetch('/api/deck-cards', {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						deckId,
						cards: changed.map((c) => ({
							id: c.id,
							front: norm(c.front),
							back: norm(c.back),
							sectionSlug: c.sectionSlug
						}))
					})
				});
				if (!res.ok) throw new Error(await readError(res, 'Nem sikerült menteni egy kártyát.'));
				for (const c of changed) {
					c.front = norm(c.front);
					c.back = norm(c.back);
					c.orig = { front: c.front, back: c.back, section: c.sectionSlug };
				}
			}
			// 4. Új kártyák egyetlen kérésben, sorrendben.
			const fresh = cards.filter((c) => !c.id && (norm(c.front) || norm(c.back)));
			if (fresh.length > 0) {
				const res = await mutationFetch('/api/deck-cards', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						deckId,
						cards: fresh.map((c) => ({
							front: norm(c.front),
							back: norm(c.back),
							sectionSlug: ''
						}))
					})
				});
				if (!res.ok) throw new Error(await readError(res, 'Nem sikerült felvenni egy kártyát.'));
				const j = await res.json();
				const ids: string[] = Array.isArray(j.ids) ? j.ids : j.id ? [j.id] : [];
				fresh.forEach((c, i) => {
					c.id = ids[i] ?? c.id;
					c.orig = { front: norm(c.front), back: norm(c.back), section: '' };
				});
				if (typeof j.skipped === 'number' && j.skipped > 0) {
					toast.warning('Betelt a csomag', `${j.skipped} kártya nem fért be a 200-as keretbe.`);
				}
			}
			toast.success('Mentve.');
			// A részletező ne a régi gyorstárazott darabszámot mutassa.
			invalidate(`package:${deckParam}`);
			void goto(detailUrl);
		} catch (e) {
			toast.error('Nem sikerült menteni', e instanceof Error ? e.message : 'Hiba történt.');
		} finally {
			saving = false;
		}
	}

	async function deleteDeck() {
		if (saving) return;
		saving = true;
		try {
			const res = await mutationFetch(`/api/decks/${encodeURIComponent(deckId)}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(await readError(res, 'Nem sikerült törölni a csomagot.'));
			toast.success('Csomag törölve.');
			deleteOpen = false;
			void goto('/kartyak');
		} catch (e) {
			toast.error('Nem sikerült törölni', e instanceof Error ? e.message : 'Hiba történt.');
		} finally {
			saving = false;
		}
	}
	const goBack = createBackNavigation(() => detailUrl);
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
		<IconButton ariaLabel="Vissza az adatlapra" size={44} onclick={goBack}>
			<ArrowLeft size={21} />
		</IconButton>
	</div>
{:else if officialBlocked}
	<EmptyState
		title="Hivatalos lecke csomag"
		description="Ezt a csomagot a lecke szerkesztőben szerkesztheted. A Kártyák oldalon csak gyakorolhatod."
	/>
	<div class="mt-4 flex justify-center gap-2">
		{#if officialBlocked.lessonId}
			<Button
				onclick={() => {
					const target = `/tanulas/szerkeszto/lecke/${encodeURIComponent(officialBlocked?.lessonId ?? '')}/kartya/${encodeURIComponent(deckId)}`;
					void goto(target);
				}}
			>
				Megnyitás a lecke szerkesztőben
			</Button>
		{/if}
		<IconButton ariaLabel="Vissza az adatlapra" size={44} onclick={goBack}>
			<ArrowLeft size={21} />
		</IconButton>
	</div>
{:else}
	<div class="flex items-center gap-2">
		<IconButton ariaLabel="Vissza az adatlapra" size={44} onclick={goBack}>
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
		<IconButton
			ariaLabel="Mentés"
			title={dirty ? 'Mentés' : 'Nincs változás'}
			size={44}
			disabled={!dirty || saving}
			onclick={() => void save()}
		>
			<Save size={20} />
		</IconButton>
	</div>

	<div class="mt-4 flex items-center gap-2 px-1">
		<h2 class="font-display min-w-0 flex-1 text-[17px] font-extrabold tracking-tight text-ink-900 dark:text-white">
			Kártyák · {filledCount}
		</h2>
		{#if dirty}
			<span class="shrink-0 rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] font-extrabold text-amber-600 uppercase dark:text-amber-300">
				Módosítva
			</span>
		{/if}
		{#if isPublic}
			<span class="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 uppercase dark:text-emerald-300">
				Publikált
			</span>
		{/if}
	</div>

	<CardRows
		bind:cards
		{frontLabel}
		{backLabel}
		{onRowInput}
		{onPasteCard}
		{onCardKeydown}
		{onRowFocusOut}
		onRemoveRow={removeRow}
	/>
{/if}

<SettingsDrawer
	open={settingsOpen}
	onClose={() => (settingsOpen = false)}
	{loading}
	{loadError}
	bind:title
	{subjectTitle}
	{levelTitle}
	{levelLabel}
	{autoKindLabel}
	{isTeacher}
	bind:isPublic
	{saving}
	{subjectId}
	onPickSubject={() => (picker = 'subject')}
	onPickLevel={() => (picker = 'level')}
	onDelete={() => (deleteOpen = true)}
/>

<EditPickerSheets
	{picker}
	onClose={() => (picker = null)}
	{subjectId}
	{levelId}
	{subjects}
	{levels}
	{levelLabel}
	{levelLabelLow}
	onSubject={(v) => {
		onSubject(v);
		picker = null;
	}}
	onLevel={(v) => {
		onLevel(v);
		picker = null;
	}}
/>



<ConfirmDialog
	open={deleteOpen}
	title="Csomag törlése"
	description="Biztosan törlöd ezt a csomagot? A benne lévő kártyák is végleg törlődnek. Ez nem vonható vissza."
	confirmLabel="Csomag törlése"
	holdLabel="Tartsd nyomva a törléshez"
	busy={saving}
	onClose={() => {
		if (!saving) deleteOpen = false;
	}}
	onConfirm={() => {
		void deleteDeck();
	}}
/>

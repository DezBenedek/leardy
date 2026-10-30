<script lang="ts">
	import { mutationFetch } from '$lib/mutation-fetch';
	import { createBackNavigation } from '$lib/back-navigation';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ArrowLeft,
		BookOpenText,
		Check,
		ChevronDown,
		Landmark,
		Languages,
		Layers,
		Leaf,
		Save,
		Settings2,
		Shapes,
		Trash2,
		X
	} from '@lucide/svelte';
	import type { DeckCardKind, LevelNode, Subject } from '$lib/curriculum';
	import { deckCardKindLabel } from '$lib/curriculum';
	import { cardKindForSubject } from '$lib/sm2';
	import { parsePastedPairs } from '$lib/deck-paste';
	import { auth } from '$lib/auth.svelte';
	import { toast } from '$lib/toast.svelte';
	import { invalidate } from '$lib/query.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import ContentPicker, { type ContentPick } from '$lib/components/ContentPicker.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import Switch from '$lib/ui/Switch.svelte';

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
	let picker = $state<'subject' | 'level' | null>(null);
	let deleteOpen = $state(false);
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
	/** Több leckéhez csatolás: az összes csatolt lecke azonosítója. */
	let lessonIds = $state<string[]>([]);
	let attachedLessons = $state<ContentPick[]>([]);
	let lessonPickerOpen = $state(false);
	/** Tanári publikálás: mindenkinek látszik a Felfedezésben és a csatolt leckénél. */
	let isPublic = $state(false);
	let cards = $state<CardRow[]>([]);
	let removedIds = $state<string[]>([]);

	/** Publikálni és leckéhez csatolni csak tanár (vagy admin) tud, diák nem. */
	let isTeacher = $derived(
		auth.ready &&
			(auth.user?.role === 'teacher' ||
				auth.user?.role === 'admin' ||
				!!auth.user?.is_admin)
	);

	// Szerver-pillanatkép a dirty-figyeléshez
	let snap = $state({
		title: '',
		cardKind: 'word' as DeckCardKind,
		subject: null as string | null,
		level: null as string | null,
		material: null as string | null,
		lesson: null as string | null,
		lessons: [] as string[],
		isPublic: false
	});

	let subjects = $state<Subject[]>([]);
	let levels = $state<LevelNode[]>([]);

	let subjectTitle = $derived(subjects.find((s) => s.id === subjectId)?.title ?? '');
	let levelTitle = $derived(levels.find((l) => l.id === levelId)?.title ?? '');
	/** A tananyagválasztó egységes címkéje. */
	const levelLabel = 'Tananyag';
	let levelLabelLow = $derived(levelLabel.toLowerCase());

	let materials = $derived(levels.find((l) => l.id === levelId)?.materials ?? []);
	let lessonOptions = $derived(materials.find((m) => m.id === materialId)?.lessons ?? []);
	let materialTitle = $derived(materials.find((m) => m.id === materialId)?.title ?? '');
	let lessonTitle = $derived(lessonOptions.find((l) => l.id === lessonId)?.title ?? '');
	let frontLabel = 'Előlap';
	let backLabel = 'Hátlap';
	/** Automatikus típus: a tantárgy dönti el, nem kézi választás. */
	let autoKindLabel = $derived(deckCardKindLabel(cardKind));

	function norm(s: string): string {
		return s.trim();
	}

	/** Változott-e valami a betöltött állapothoz képest? */
	let dirty = $derived.by(() => {
		if (norm(title) !== snap.title) return true;
		if (cardKind !== snap.cardKind) return true;
		if (isPublic !== snap.isPublic) return true;
		if ((subjectId || null) !== snap.subject) return true;
		if ((levelId || null) !== snap.level) return true;
		if ((materialId || null) !== snap.material) return true;
		const cur = [...lessonIds].sort().join('|');
		const old = [...snap.lessons].sort().join('|');
		if (cur !== old) return true;
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
			const ids: string[] = Array.isArray(d.lessonIds)
				? d.lessonIds.filter(Boolean)
				: d.lessonId
					? [d.lessonId]
					: [];
			lessonIds = ids;
			lessonId = ids[0] ?? '';
			isPublic = d.isPublic === true;
			const rawLessons: { id: string; title: string }[] = Array.isArray(d.lessons)
				? d.lessons
				: [];
			attachedLessons = lessonIds.map((id) => {
				const found = rawLessons.find((l) => l.id === id);
				return {
					kind: 'lesson' as const,
					subjectId: subjectId,
					subjectTitle: '',
					levelId: levelId,
					levelTitle: '',
					levelLabel: 'Tananyag',
					topicId: materialId,
					topicTitle: '',
					lessonId: id,
					lessonTitle: found?.title ?? id,
					quizCount: 0,
					crumb: found?.title ?? id
				};
			});
			snap = {
				title,
				cardKind,
				subject: d.subjectId ?? null,
				level: d.levelId ?? null,
				material: d.materialId ?? null,
				lesson: d.lessonId ?? null,
				lessons: [...lessonIds],
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
		lessonId = '';
		lessonIds = [];
		attachedLessons = [];
		for (const c of cards) c.sectionSlug = '';
		const subj = subjects.find((s) => s.id === v);
		cardKind = cardKindForSubject(subj?.title ?? '', subj?.icon ?? 'book', v || null);
		void fetchLevels(v);
	}

	function onLevel(v: string) {
		levelId = v;
		materialId = '';
		lessonId = '';
		lessonIds = [];
		attachedLessons = [];
		for (const c of cards) c.sectionSlug = '';
	}

	function onMaterial(v: string) {
		materialId = v;
		// Többes csatolásnál a témakör csak tájékoztató: a leckék maradnak.
		for (const c of cards) c.sectionSlug = '';
	}

	function onLessonPick(picks: ContentPick[]) {
		attachedLessons = picks;
		lessonIds = picks.map((p) => p.lessonId).filter(Boolean);
		lessonId = lessonIds[0] ?? '';
		// Örökölt egy-leckés mezők az első választáshoz igazodnak.
		const first = picks[0];
		if (first) {
			materialId = first.topicId ?? materialId;
		} else {
			materialId = '';
			lessonId = '';
		}
		lessonPickerOpen = false;
	}

	function removeLesson(id: string) {
		attachedLessons = attachedLessons.filter((p) => p.lessonId !== id);
		lessonIds = lessonIds.filter((x) => x !== id);
		lessonId = lessonIds[0] ?? '';
		if (lessonIds.length === 0) materialId = '';
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

	/** Üres mezőben nyomott Backspace: fókusz az előző mező végére.
	   Üres hátlapból az azonos sor előlapjára, onnan (ha az is üres)
	   az előző sor hátlapjára. Üres előlapból az előző sor hátlapjára. */
	function onCardKeydown(e: KeyboardEvent, field: 'front' | 'back') {
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
		// Csatolás és publikálás csak tanárnak megy: diák mentése ezeket nem érinti.
		const patch: Record<string, string | string[] | boolean | null> = {};
		if (t !== snap.title) patch.title = t;
		if ((subjectId || null) !== snap.subject) patch.subjectId = subjectId || null;
			if ((levelId || null) !== snap.level) patch.levelId = levelId || null;
			if ((materialId || null) !== snap.material) patch.materialId = materialId || null;
			if (isTeacher) {
				const curLessons = [...lessonIds].sort().join('|');
				const oldLessons = [...snap.lessons].sort().join('|');
				if (curLessons !== oldLessons) patch.lessonIds = [...lessonIds];
				if (isPublic !== snap.isPublic) patch.isPublic = isPublic;
			}
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
				lesson: lessonId || null,
				lessons: [...lessonIds],
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

	<div class="mt-2 overflow-hidden rounded-[20px] border border-stone-200 bg-white dark:border-white/10 dark:bg-stone-900">
		<ul id="card-rows" class="divide-y divide-stone-100 dark:divide-white/5">
			{#each cards as card, i (card.key)}
				<li class="flex items-center gap-1.5 px-2 py-1.5">
					<span
						class="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-extrabold text-brand-600 tabular-nums dark:bg-brand-500/20 dark:text-white"
						aria-hidden="true"
					>
						{i + 1}
					</span>
					<input
						bind:value={card.front}
						data-field="front"
						oninput={onRowInput}
						onpaste={(e) => onPasteCard(e, card)}
						onkeydown={(e) => onCardKeydown(e, 'front')}
						placeholder={frontLabel}
						aria-label="{i + 1}. kártya {frontLabel.toLowerCase()} oldala"
						class={cardInputCls}
					/>
					<input
						bind:value={card.back}
						data-field="back"
						oninput={onRowInput}
						onpaste={(e) => onPasteCard(e, card)}
						onkeydown={(e) => onCardKeydown(e, 'back')}
						placeholder={backLabel}
						aria-label="{i + 1}. kártya {backLabel.toLowerCase()} oldala"
						class={cardInputCls}
					/>
					{#if cards.length > 1}
						<button
							type="button"
							onclick={() => removeRow(card)}
							aria-label="{i + 1}. kártya törlése"
							class="grid size-8 shrink-0 place-items-center rounded-full text-stone-300 transition hover:bg-red-50 hover:text-red-600 active:scale-95 dark:text-stone-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
						>
							<X size={15} />
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
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
			Kártyák típusa: {autoKindLabel}
		</p>

		{#if isTeacher}
			<div class="mt-3 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-transparent">
				<span class="min-w-0 flex-1">
					<span class="block text-[14px] font-extrabold text-ink-900 dark:text-white">Publikálva</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
						Mindenki látja a Felfedezésben és a csatolt leckénél
					</span>
				</span>
				<Switch id="deck-published" bind:checked={isPublic} label="Publikálva" />
			</div>

			<p class="mt-4 text-[13px] font-semibold text-ink-900 dark:text-white">
				Csatolás <span class="font-normal text-stone-400 dark:text-stone-500">(opcionális, több lecke is lehet)</span>
			</p>
			<div class="mt-1.5 grid gap-2">
				<button type="button" onclick={() => (lessonPickerOpen = true)} class={pickRowBtn}>
					<span class="min-w-0 flex-1">
						<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Leckék</span>
						<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
							{attachedLessons.length > 0 ? `${attachedLessons.length} lecke csatolva` : 'Nincs csatolva'}
						</span>
					</span>
					<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
				</button>
				{#if attachedLessons.length > 0}
					<ul class="grid gap-1.5">
						{#each attachedLessons as a (a.lessonId)}
							<li class="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-transparent">
								<span class="min-w-0 flex-1">
									<span class="block truncate text-[13px] font-bold text-ink-900 dark:text-white">
										{a.lessonTitle}
									</span>
									<span class="block truncate text-[11px] font-medium text-stone-500 dark:text-stone-400">
										{a.crumb}
									</span>
								</span>
								<button
									type="button"
									onclick={() => removeLesson(a.lessonId)}
									aria-label="{a.lessonTitle} csatolás törlése"
									class="grid size-8 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
								>
									<X size={15} />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else}
			<p class="mt-4 rounded-2xl bg-stone-100 px-3 py-2.5 text-[12px] font-medium text-stone-500 dark:bg-white/5 dark:text-stone-400">
				A csomagod privát: csak te látod. Leckéhez csatolni és publikálni csak tanár tud.
			</p>
		{/if}

		<div class="mt-6 border-t border-stone-200 pt-4 dark:border-white/10">
			<Button variant="outline" block disabled={saving} onclick={() => (deleteOpen = true)}>
				<Trash2 size={16} />
				Csomag törlése
			</Button>
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
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">{s.packCount} csomag</span>
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

<ContentPicker
	open={lessonPickerOpen}
	subjects={subjects}
	baseSubjectId={subjectId || undefined}
	select="lesson"
	multi
	initialSelected={attachedLessons}
	onClose={() => (lessonPickerOpen = false)}
	onPick={(picks) => onLessonPick(picks)}
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

<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ArrowUp, ArrowDown, Check, Layers, Pencil, Plus, Trash2 } from '@lucide/svelte';
	import Drawer from './Drawer.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import ActionMenu from '$lib/ui/ActionMenu.svelte';
	import AddItemButton from '$lib/ui/AddItemButton.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import { editCurriculum } from '$lib/curriculum/curriculum-edit-api';
	import { deckCardKindLabel } from '$lib/curriculum/curriculum';
	import type { EditorLessonDeck } from '$lib/curriculum/curriculum-editor';
	import { toast } from '$lib/state/toast.svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';

	/* Hivatalos lecke csomagok listája a lecke szerkesztő Drawer paneljében.
	   Létrehozás, átnevezés, sorrend és törlés ugyanitt, szerkesztés a
	   lecke alatti pack oldalon. */

	interface Props {
		lessonId: string;
		levelId: string;
		open: boolean;
		initialDecks?: EditorLessonDeck[];
		onClose: () => void;
	}

	let { lessonId, levelId, open, initialDecks = [], onClose }: Props = $props();

	let decks = $state<EditorLessonDeck[]>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let busy = $state(false);
	let createOpen = $state(false);
	let createName = $state('');
	let createError = $state('');
	let renameTarget = $state<EditorLessonDeck | null>(null);
	let renameName = $state('');
	let renameError = $state('');
	let deleteTarget = $state<EditorLessonDeck | null>(null);

	const inputCls =
		'w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white';

	function kindLabel(deck: EditorLessonDeck): string {
		return `${deck.count} kártya · ${deckCardKindLabel(deck.cardKind)}`;
	}

	async function readError(res: Response, fallback: string): Promise<string> {
		try {
			const j = await res.json();
			if (typeof j?.error === 'string' && j.error) return j.error;
			if (typeof j?.message === 'string' && j.message) return j.message;
		} catch {
			// JSON nélküli válasz
		}
		if (!res.ok) return fallback;
		return fallback;
	}

	async function load() {
		loading = true;
		loadError = null;
		try {
			const res = await fetch(`/api/curriculum?lessonDecks=${encodeURIComponent(lessonId)}`);
			if (!res.ok) throw new Error(await readError(res, 'Nem sikerült betölteni a csomagokat.'));
			const j = await res.json();
			decks = (j.decks ?? []) as EditorLessonDeck[];
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Nem sikerült betölteni a csomagokat.';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open) {
			decks = [...initialDecks];
			createOpen = false;
			renameTarget = null;
			deleteTarget = null;
			void load();
		}
	});

	function openPack(id: string) {
		onClose();
		void goto(resolve('/tanulas/szerkeszto/lecke/[id]/kartya/[deckId]', { id: lessonId, deckId: id }));
	}

	async function createDeck() {
		const title = createName.trim();
		if (!title) {
			createError = 'Add meg a csomag nevét.';
			return;
		}
		if (title.length > 80) {
			createError = 'A csomag neve legfeljebb 80 karakter lehet.';
			return;
		}
		busy = true;
		createError = '';
		try {
			const result = await editCurriculum<{ id: string }>({
				action: 'createLessonDeck', levelId, lessonId, title
			});
			createOpen = false;
			createName = '';
			toast.success('Csomag létrehozva');
			openPack(result.id);
		} catch (e) {
			createError = e instanceof Error ? e.message : 'Nem sikerült létrehozni a csomagot.';
		} finally {
			busy = false;
		}
	}

	async function renameDeck() {
		if (!renameTarget) return;
		const title = renameName.trim();
		if (!title) {
			renameError = 'Add meg a csomag nevét.';
			return;
		}
		busy = true;
		renameError = '';
		try {
			await editCurriculum({
				action: 'renameLessonDeck', levelId, lessonId, deckId: renameTarget.id, title
			});
			decks = decks.map((d) => (d.id === renameTarget!.id ? { ...d, title } : d));
			renameTarget = null;
			toast.success('Csomag átnevezve');
		} catch (e) {
			renameError = e instanceof Error ? e.message : 'Nem sikerült átnevezni a csomagot.';
		} finally {
			busy = false;
		}
	}

	async function deleteDeck() {
		if (!deleteTarget || busy) return;
		busy = true;
		try {
			await editCurriculum({
				action: 'deleteLessonDeck', levelId, lessonId, deckId: deleteTarget.id
			});
			decks = decks.filter((d) => d.id !== deleteTarget!.id);
			deleteTarget = null;
			toast.success('Csomag törölve.');
		} catch (e) {
			toast.error('Nem sikerült törölni', e instanceof Error ? e.message : 'Hiba történt.');
		} finally {
			busy = false;
		}
	}

	async function moveDeck(deck: EditorLessonDeck, delta: number) {
		if (busy) return;
		const index = decks.findIndex((d) => d.id === deck.id);
		const target = index + delta;
		if (index < 0 || target < 0 || target >= decks.length) return;
		const next = [...decks];
		[next[index], next[target]] = [next[target], next[index]];
		const previous = decks;
		decks = next;
		busy = true;
		try {
			await editCurriculum({
				action: 'reorderLessonDecks', levelId, lessonId, ids: next.map((d) => d.id)
			});
		} catch (e) {
			decks = previous;
			toast.error('Nem sikerült átrendezni', e instanceof Error ? e.message : 'Hiba történt.');
		} finally {
			busy = false;
		}
	}
</script>

<Drawer {open} label="Lecke kártyacsomagjai" title="Kártyacsomagok" {onClose}>
	{#if loading}
		<div role="status" aria-label="Csomagok betöltése" class="grid gap-2">
			<Skeleton cls="h-16 rounded-2xl" />
			<Skeleton cls="h-16 rounded-2xl" />
			<span class="sr-only">Betöltés…</span>
		</div>
	{:else if loadError}
		<EmptyState title="Nem sikerült betölteni" description={loadError} />
		<div class="mt-4 flex justify-center">
			<Button variant="outline" onclick={() => void load()}>Újra</Button>
		</div>
	{:else if decks.length === 0}
		<EmptyState
			title="Még nincs kártyacsomag"
			description="Hozz létre egy csomagot a leckéhez. A Felfedezésben automatikusan megjelenik, és a Könyvtárba menthető."
		/>
	{:else}
		<ul class="grid gap-1.5" aria-label="A lecke kártyacsomagjai">
			{#each decks as deck, index (deck.id)}
				<li class="flex items-center gap-1 rounded-2xl border border-stone-200 px-2 py-1.5 dark:border-white/10">
					<button
						type="button"
						aria-label="{index + 1}. csomag megnyitása: {deck.title}"
						disabled={busy}
						onclick={() => openPack(deck.id)}
						class="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl text-left disabled:opacity-60"
					>
						<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300" aria-hidden="true">
							<Layers size={18} />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm font-bold text-ink-900 dark:text-white">{deck.title}</span>
							<span class="block truncate text-[11px] text-stone-500 dark:text-stone-400">{kindLabel(deck)}</span>
						</span>
						<span class="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 uppercase dark:text-emerald-300">
							Hivatalos
						</span>
					</button>
					<ActionMenu
						compact
						floating
						label={`Műveletek: ${deck.title}`}
						disabled={busy}
						actions={[
							{ id: 'open', label: 'Megnyitás', icon: Layers, onclick: () => openPack(deck.id) },
							{ id: 'rename', label: 'Átnevezés', icon: Pencil, onclick: () => { renameTarget = deck; renameName = deck.title; renameError = ''; } },
							{ id: 'up', label: 'Feljebb', icon: ArrowUp, disabled: index === 0, onclick: () => void moveDeck(deck, -1) },
							{ id: 'down', label: 'Lejjebb', icon: ArrowDown, disabled: index === decks.length - 1, onclick: () => void moveDeck(deck, 1) },
							{ id: 'delete', label: 'Törlés', icon: Trash2, tone: 'danger', onclick: () => (deleteTarget = deck) }
						]}
					/>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="mt-3">
		<AddItemButton label="Csomag hozzáadása" disabled={busy || loading} onclick={() => { createName = ''; createError = ''; createOpen = true; }} />
	</div>
</Drawer>

<div use:portal>
	<Sheet open={createOpen} label="Új kártyacsomag" title="Új csomag" onClose={() => { if (!busy) createOpen = false; }}>
		<form class="mt-4 space-y-4" onsubmit={(e) => { e.preventDefault(); void createDeck(); }}>
			<label class="block text-sm font-bold text-ink-900 dark:text-white">
				Csomag neve
				<input class="{inputCls} mt-1" bind:value={createName} required maxlength={80} disabled={busy} placeholder="Pl. Szókincs 1" />
			</label>
			<p class="text-xs leading-5 text-stone-500 dark:text-stone-400">
				A csomag a lecke tantárgyát örökli, a Felfedezésben azonnal látszik. Szerkesztés után a Megnyitás visz a kártyákhoz.
			</p>
			{#if createError}<p role="alert" class="text-sm text-red-600 dark:text-red-400">{createError}</p>{/if}
			<Button type="submit" busy={busy} block>Létrehozás</Button>
		</form>
	</Sheet>

	<Sheet open={renameTarget !== null} label="Csomag átnevezése" title="Átnevezés" onClose={() => { if (!busy) renameTarget = null; }}>
		{#if renameTarget}
			<form class="mt-4 space-y-4" onsubmit={(e) => { e.preventDefault(); void renameDeck(); }}>
				<label class="block text-sm font-bold text-ink-900 dark:text-white">
					Csomag neve
					<input class="{inputCls} mt-1" bind:value={renameName} required maxlength={80} disabled={busy} />
				</label>
				{#if renameError}<p role="alert" class="text-sm text-red-600 dark:text-red-400">{renameError}</p>{/if}
				<Button type="submit" busy={busy} block>Átnevezés</Button>
			</form>
		{/if}
	</Sheet>

	<ConfirmDialog
		open={deleteTarget !== null}
		title="Csomag törlése"
		description={deleteTarget ? `Biztosan törlöd a(z) „${deleteTarget.title}” csomagot? A benne lévő kártyák is végleg törlődnek. Ez nem vonható vissza.` : ''}
		confirmLabel="Csomag törlése"
		holdLabel="Tartsd nyomva a törléshez"
		{busy}
		onClose={() => { if (!busy) deleteTarget = null; }}
		onConfirm={() => { void deleteDeck(); }}
	/>
</div>

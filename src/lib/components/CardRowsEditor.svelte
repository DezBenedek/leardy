<script lang="ts">
	import { X } from '@lucide/svelte';
	import { parsePastedPairs } from '$lib/deck/deck-paste';
	import { pruneEmptyRows } from '$lib/deck/deck-rows';
	import { toast } from '$lib/state/toast.svelte';

	/* Kártyasor szerkesztő: mindig egy üres sor a végén, paste több sorral,
	   Enter új sor, Backspace navigálás, fókuszvesztéskor takarítás.
	   Nem tud API-ról, csak a sorok állapotát kezeli. */

	export interface CardEditorRow {
		key: number;
		id: string | null;
		front: string;
		back: string;
		sectionSlug: string;
		orig: { front: string; back: string; section: string } | null;
	}

	interface Props {
		rows?: CardEditorRow[];
		removedIds?: string[];
		initial?: { id: string | null; front: string; back: string; sectionSlug?: string }[];
		disabled?: boolean;
		frontLabel?: string;
		backLabel?: string;
		maxCards?: number;
		onDirtyChange?: (dirty: boolean) => void;
		onCountChange?: (count: number) => void;
	}

	let {
		rows = $bindable<CardEditorRow[]>([]),
		removedIds = $bindable<string[]>([]),
		initial = [],
		disabled = false,
		frontLabel = 'Előlap',
		backLabel = 'Hátlap',
		maxCards = 200,
		onDirtyChange,
		onCountChange
	}: Props = $props();

	let nextKey = $state(1);
	let listElement: HTMLUListElement | undefined = $state();
	let lastInitial: unknown = null;

	const cardInputCls =
		'min-w-0 w-full rounded-xl border border-transparent bg-stone-100 px-2.5 py-2 text-[14px] font-medium text-ink-900 outline-none transition placeholder:font-normal placeholder:text-stone-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 motion-reduce:transition-none dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:bg-white/10';

	function norm(s: string): string {
		return s.trim();
	}

	$effect(() => {
		if (initial !== lastInitial) {
			lastInitial = initial;
			nextKey = 1;
			removedIds = [];
			rows = initial.map((c) => ({
				key: nextKey++,
				id: c.id,
				front: c.front,
				back: c.back,
				sectionSlug: c.sectionSlug ?? '',
				orig: c.id ? { front: c.front, back: c.back, section: c.sectionSlug ?? '' } : null
			}));
			ensureTrailingEmpty();
		}
	});

	/** Változott-e valami a betöltött állapothoz képest? */
	let dirty = $derived.by(() => {
		if (removedIds.length > 0) return true;
		for (const c of rows) {
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

	/** Kitöltött kártyák száma (az üres sor nem számít). */
	let filledCount = $derived(rows.filter((c) => norm(c.front) || norm(c.back)).length);

	$effect(() => {
		onDirtyChange?.(dirty);
	});
	$effect(() => {
		onCountChange?.(filledCount);
	});

	/** Mindig van egy üres sor a végén: ha az utolsóba írnak, új üres nyílik. */
	function ensureTrailingEmpty() {
		const last = rows[rows.length - 1];
		if (!last || norm(last.front) || norm(last.back)) {
			rows = [...rows, { key: nextKey++, id: null, front: '', back: '', sectionSlug: '', orig: null }];
		}
	}

	function onRowInput() {
		if (!disabled) ensureTrailingEmpty();
	}

	/** Beillesztés a vágólapról: "előlap;hátlap" sorok, tabbal vagy |-vonallal is.
	 *  Sima szövegnél marad az alapértelmezett beillesztés. */
	function onPasteCard(e: ClipboardEvent, card: CardEditorRow) {
		if (disabled) return;
		const text = e.clipboardData?.getData('text') ?? '';
		if (!text) return;
		const pairs = parsePastedPairs(text);
		if (pairs.length === 0) return;
		// Egy elválasztó nélküli érték: alapértelmezett beillesztés a mezőbe.
		if (pairs.length === 1 && !pairs[0].back) return;
		e.preventDefault();
		const idx = rows.findIndex((c) => c.key === card.key);
		if (idx < 0) return;
		const used = rows.filter((c) => c.key === card.key || norm(c.front) || norm(c.back)).length;
		let list = pairs;
		if (used + pairs.length - 1 > maxCards) {
			list = pairs.slice(0, Math.max(0, maxCards - used + 1));
			if (list.length === 0) {
				toast.warning('Betelt a csomag', `Legfeljebb ${maxCards} kártya lehet egy csomagban.`);
				return;
			}
			toast.warning('Betelt a csomag', `Csak az első ${list.length} kártya illeszkedett be.`);
		}
		const next = [...rows];
		next[idx] = { ...next[idx], front: list[0].front, back: list[0].back };
		if (list.length > 1) {
			const inserts: CardEditorRow[] = list
				.slice(1)
				.map((p) => ({ key: nextKey++, id: null, front: p.front, back: p.back, sectionSlug: '', orig: null }));
			next.splice(idx + 1, 0, ...inserts);
			toast.success(`${list.length} kártya beillesztve.`);
		}
		rows = next;
		ensureTrailingEmpty();
		// A beillesztett sorok látszódjanak: a cél sor utáni sor a nézetbe kerül.
		requestAnimationFrame(() => {
			try {
				const items = listElement?.querySelectorAll(':scope > li') ?? [];
				const el = items[idx + 1] ?? items[idx];
				el?.scrollIntoView({ block: 'nearest' });
			} catch {
				// görgetés nélkül is működik
			}
		});
	}

	function removeRow(card: CardEditorRow) {
		if (disabled || rows.length <= 1) return;
		if (card.id) removedIds = [...removedIds, card.id];
		rows = rows.filter((c) => c.key !== card.key);
		ensureTrailingEmpty();
	}

	/** Új üres sor beszúrása az adott sor után, fókusszal az előlap mezőn. */
	export function insertRowAfter(card: CardEditorRow) {
		if (disabled) return;
		const idx = rows.findIndex((c) => c.key === card.key);
		if (idx < 0) return;
		const next = [...rows];
		next.splice(idx + 1, 0, { key: nextKey++, id: null, front: '', back: '', sectionSlug: '', orig: null });
		rows = next;
		requestAnimationFrame(() => {
			try {
				const items = listElement?.querySelectorAll(':scope > li') ?? [];
				items[idx + 1]?.querySelector<HTMLInputElement>('input[data-field="front"]')?.focus();
			} catch {
				// fókusz nélkül is működik
			}
		});
	}

	/** AI piszkozatok hozzáadása a lista végére, a záró üres sor elé. */
	export function appendDrafts(items: { front: string; back: string; sectionSlug?: string }[]) {
		if (disabled || items.length === 0) return;
		const kept = rows.filter((c) => c.id || norm(c.front) || norm(c.back));
		const room = maxCards - kept.length;
		const take = items.slice(0, Math.max(0, room));
		for (const p of take) {
			kept.push({ key: nextKey++, id: null, front: p.front, back: p.back, sectionSlug: p.sectionSlug ?? '', orig: null });
		}
		rows = kept;
		ensureTrailingEmpty();
		toast.success(`${take.length} kártya hozzáadva.`);
		if (take.length < items.length) {
			toast.warning('Betelt a csomag', `Csak az első ${take.length} kártya fért be a ${maxCards}-as keretbe.`);
		}
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
			rows,
			Number.isFinite(exemptKey) ? exemptKey : null
		);
		if (!changed) return;
		if (gone.length > 0) removedIds = [...removedIds, ...gone];
		rows = kept;
		ensureTrailingEmpty();
	}

	/** Üres mezőben nyomott Backspace: fókusz az előző mező végére.
	   Üres hátlapból az azonos sor előlapjára, onnan (ha az is üres)
	   az előző sor hátlapjára. Üres előlapból az előző sor hátlapjára.
	   Hátlapban nyomott Enter új sort szúr be a sor után. */
	function onCardKeydown(e: KeyboardEvent, card: CardEditorRow, field: 'front' | 'back') {
		if (disabled || e.isComposing) return;
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
</script>

<div class="overflow-hidden rounded-[20px] border border-stone-200 bg-white dark:border-white/10 dark:bg-stone-900">
	<div class="flex items-center gap-1.5 border-b border-stone-100 bg-stone-50 px-2 py-2 dark:border-white/5 dark:bg-white/5" aria-hidden="true">
		<span class="grid size-6 shrink-0"></span>
		<p class="min-w-0 flex-1 text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">
			{frontLabel}
		</p>
		<p class="min-w-0 flex-1 text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">
			{backLabel}
		</p>
		{#if rows.length > 1}
			<span class="grid size-8 shrink-0"></span>
		{/if}
	</div>
	<ul bind:this={listElement} class="divide-y divide-stone-100 dark:divide-white/5">
		{#each rows as card, i (card.key)}
			<li class="flex items-center gap-1.5 px-2 py-1.5" data-key={card.key} onfocusout={onRowFocusOut}>
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
					onkeydown={(e) => onCardKeydown(e, card, 'front')}
					placeholder={frontLabel}
					aria-label="{i + 1}. kártya {frontLabel.toLowerCase()} oldala"
					disabled={disabled}
					class={cardInputCls}
				/>
				<input
					bind:value={card.back}
					data-field="back"
					oninput={onRowInput}
					onpaste={(e) => onPasteCard(e, card)}
					onkeydown={(e) => onCardKeydown(e, card, 'back')}
					placeholder={backLabel}
					aria-label="{i + 1}. kártya {backLabel.toLowerCase()} oldala"
					disabled={disabled}
					class={cardInputCls}
				/>
				{#if rows.length > 1}
					<button
						type="button"
						tabindex="-1"
						onclick={() => removeRow(card)}
						disabled={disabled}
						aria-label="{i + 1}. kártya törlése"
						class="grid size-8 shrink-0 place-items-center rounded-full text-stone-300 transition hover:bg-red-50 hover:text-red-600 active:scale-95 disabled:opacity-50 dark:text-stone-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
					>
						<X size={15} />
					</button>
				{/if}
			</li>
		{/each}
	</ul>
</div>

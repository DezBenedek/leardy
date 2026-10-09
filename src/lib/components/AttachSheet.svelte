<script lang="ts" module>
	/* Üzenet-csatolmány választó: előbb típus-csempe (Lecke, Kvíz, Témakör,
	   Kártya), majd a globális ContentPicker drawer visz végig a
	   Tantárgy, Tananyag, Témakör, Lecke sorrenden. Több csatolmány is
	   választható; a Kártya-lista saját. Oldalgyökérben kell használni. */

	export interface AttachPick {
		type: 'subject' | 'lesson' | 'quiz' | 'deck' | 'topic';
		id: string;
		title: string;
		crumb: string;
	}
</script>

<script lang="ts">
	import { BookOpen, Check, Layers, Minus, Plus, Search, Target, X } from '@lucide/svelte';
	import type { Subject } from '$lib/curriculum';
	import Button from '$lib/ui/Button.svelte';
	import Drawer from './Drawer.svelte';
	import ContentPicker, { type ContentPick } from './ContentPicker.svelte';

	interface DeckOpt {
		quizId: string;
		title: string;
	}

	interface Props {
		open: boolean;
		subjects: Subject[];
		decks: DeckOpt[];
		onClose: () => void;
		onPick: (picks: AttachPick[]) => void;
	}

	let { open, subjects, decks, onClose, onPick }: Props = $props();

	type Kind = 'lesson' | 'quiz' | 'deck' | 'topic';

	let kind = $state<Kind>('lesson');
	let deckView = $state(false);
	let pickedDecks = $state<string[]>([]);
	let pickerOpen = $state(false);
	let deckQuery = $state('');

	// Nyitáskor tiszta lappal indul.
	let wasOpen = $state(false);
	$effect(() => {
		if (open && !wasOpen) {
			wasOpen = true;
			reset();
		} else if (!open && wasOpen) {
			wasOpen = false;
		}
	});

	function reset() {
		kind = 'lesson';
		deckView = false;
		pickedDecks = [];
		pickerOpen = false;
		deckQuery = '';
	}

	function closeAll() {
		pickerOpen = false;
		onClose();
	}

	function chooseKind(k: Kind) {
		kind = k;
		if (k === 'deck') deckView = true;
		else pickerOpen = true;
	}

	function backToTypes() {
		deckView = false;
		pickedDecks = [];
		deckQuery = '';
	}

	function toggleDeck(quizId: string) {
		pickedDecks = pickedDecks.includes(quizId)
			? pickedDecks.filter((d) => d !== quizId)
			: [...pickedDecks, quizId];
	}

	function finishDecks() {
		const picks: AttachPick[] = pickedDecks
			.map((id) => decks.find((d) => d.quizId === id))
			.filter((d) => d !== undefined)
			.map((d) => ({ type: 'deck' as const, id: d.quizId, title: d.title, crumb: d.title }));
		if (picks.length > 0) onPick(picks);
	}

	function finishContent(picks: ContentPick[]) {
		const out: AttachPick[] = [];
		for (const p of picks) {
			if (p.kind === 'topic') {
				out.push({ type: 'topic', id: p.topicId, title: p.topicTitle, crumb: p.crumb });
			} else if (p.lessonId) {
				out.push({
					type: kind === 'quiz' ? 'quiz' : 'lesson',
					id: p.lessonId,
					title: p.lessonTitle,
					crumb: p.crumb
				});
			}
		}
		pickerOpen = false;
		if (out.length > 0) onPick(out);
	}

	const kindTiles: { id: Kind; label: string; desc: string; icon: typeof BookOpen }[] = [
		{ id: 'lesson', label: 'Lecke', desc: 'Elmélet a leckéből', icon: BookOpen },
		{ id: 'quiz', label: 'Kvíz', desc: 'Kvízes leckék', icon: Target },
		{ id: 'topic', label: 'Témakör', desc: 'Egy témakör a tananyagból', icon: BookOpen },
		{ id: 'deck', label: 'Kártya', desc: 'Kártyacsomag', icon: Layers }
	];

	const rowBtn =
		'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 text-left transition active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100';
	const rowTile =
		'grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300';
	const rowTileSel = 'grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-white';
	const pillRow = (sel: boolean) =>
		[
			'flex items-center gap-1 rounded-2xl p-1 pr-1.5 transition',
			sel ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-stone-100 dark:hover:bg-white/5'
		].join(' ');
	const toggleBtn = (sel: boolean) =>
		[
			'grid size-9 shrink-0 place-items-center rounded-full border transition active:scale-90',
			sel
				? 'border-brand-500 bg-brand-500 text-white'
				: 'border-stone-300 text-stone-500 hover:bg-white dark:border-white/20 dark:text-stone-300 dark:hover:bg-white/10'
		].join(' ');

	function normDeck(s: string): string {
		return s
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');
	}

	let visibleDecks = $derived(
		decks.filter(
			(d) =>
				deckQuery.trim() === '' ||
				normDeck(d.title).includes(normDeck(deckQuery.trim()))
		)
	);
</script>

{#snippet deckSearch()}
	<div class="relative mt-2">
		<Search
			size={16}
			class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-400 dark:text-stone-500"
			aria-hidden="true"
		/>
		<input
			type="text"
			bind:value={deckQuery}
			placeholder="Keresés…"
			aria-label="Keresés a csomagokban"
			autocomplete="off"
			class="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pr-10 pl-10 text-[14px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 motion-reduce:transition-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:bg-white/5 dark:focus:ring-brand-500/20"
		/>
		{#if deckQuery}
			<button
				type="button"
				onpointerdown={(event) => event.preventDefault()}
				onclick={() => (deckQuery = '')}
				aria-label="Keresés törlése"
				class="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-stone-400 transition hover:bg-black/5 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
			>
				<X size={15} />
			</button>
		{/if}
	</div>
{/snippet}

<Drawer
	{open}
	label="Csatolmány választása"
	title={deckView ? 'Kártyacsomag' : 'Csatolmány típusa'}
	onBack={deckView ? backToTypes : undefined}
	onClose={closeAll}
>
	{#if !deckView}
		<div class="mt-2 grid grid-cols-2 gap-2">
			{#each kindTiles as k (k.id)}
				{@const Icon = k.icon}
				<button
					type="button"
					onclick={() => chooseKind(k.id)}
					class="flex flex-col items-start gap-2 rounded-2xl border border-stone-200 p-3.5 text-left transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:hover:bg-white/5"
				>
					<span class="grid size-10 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
						<Icon size={20} />
					</span>
					<span>
						<span class="block text-[15px] font-extrabold text-ink-900 dark:text-white">{k.label}</span>
						<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">{k.desc}</span>
					</span>
				</button>
			{/each}
		</div>
	{:else}
		{@render deckSearch()}
		<ul class="-mx-1 mt-2 space-y-0.5">
			{#if visibleDecks.length === 0}
				<li>
					<p class="p-2 text-sm text-stone-500 dark:text-stone-400">
						{deckQuery.trim() ? 'Nincs ilyen találat.' : 'Nincs saját kártyacsomagod.'}
					</p>
				</li>
			{:else}
				{#each visibleDecks as d (d.quizId)}
					{@const sel = pickedDecks.includes(d.quizId)}
					<li class={pillRow(sel)}>
						<button type="button" onclick={() => toggleDeck(d.quizId)} class={rowBtn}>
							<span class={sel ? rowTileSel : rowTile}>
								<Layers size={18} aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
									{d.title}
								</span>
							</span>
							{#if sel}
								<Check size={18} strokeWidth={3} class="shrink-0 text-brand-600 dark:text-white" aria-hidden="true" />
							{/if}
						</button>
						<button
							type="button"
							aria-label={sel ? 'Csomag kivétele' : 'Csomag hozzáadása'}
							aria-pressed={sel}
							onclick={() => toggleDeck(d.quizId)}
							class={toggleBtn(sel)}
						>
							{#if sel}<Minus size={16} strokeWidth={3} />{:else}<Plus size={16} strokeWidth={3} />{/if}
						</button>
					</li>
				{/each}
			{/if}
		</ul>
		{#if decks.length > 0}
			<div class="mt-3">
				<Button block disabled={pickedDecks.length === 0} onclick={finishDecks}>
					Kész ({pickedDecks.length})
				</Button>
			</div>
		{/if}
	{/if}
</Drawer>

<ContentPicker
	open={pickerOpen}
	{subjects}
	select={kind === 'topic' ? 'topic' : 'lesson'}
	multi
	onlyWithQuiz={kind === 'quiz'}
	onClose={() => (pickerOpen = false)}
	onPick={finishContent}
/>

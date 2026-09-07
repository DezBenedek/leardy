<script lang="ts">
	import { page } from '$app/state';
	import { ArrowLeft, Ellipsis, Pencil, Play, Plus, StickyNote, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card } from '$lib/components/ui/card/index.js';
	import { Dialog } from '$lib/components/ui/dialog/index.js';
	import EmptyState from '$lib/components/empty-state.svelte';
	import KnowledgeSignal from '$lib/components/knowledge-signal.svelte';
	import { levelKeyFor } from '$lib/srs.js';
	import { store } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';
	import { toasts } from '$lib/components/ui/toast/toast.svelte.js';

	const id = $derived(page.params.id ?? '');
	const deck = $derived(store.data.decks.find((d) => d.id === id));
	const cards = $derived(store.data.cards.filter((c) => c.deckId === id));
	const stats = $derived(deck ? store.deckStats(deck.id) : null);
	const pct = $derived(stats && stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0);

	let mode = $state<'new' | 'edit'>('new');
	let formOpen = $state(false);
	let delOpen = $state(false);
	let deckDelOpen = $state(false);
	let optOpen = $state(false);
	let targetId = $state<string | null>(null);
	let front = $state('');
	let back = $state('');
	let example = $state('');
	let hint = $state('');

	function openNew() {
		front = '';
		back = '';
		example = '';
		hint = '';
		targetId = null;
		mode = 'new';
		formOpen = true;
	}

	function openEdit(cardId: string) {
		const c = store.data.cards.find((x) => x.id === cardId);
		if (!c) return;
		front = c.front;
		back = c.back;
		example = c.example;
		hint = c.hint;
		targetId = cardId;
		mode = 'edit';
		formOpen = true;
	}

	function submit() {
		if (!front.trim() || !back.trim() || !deck) return;
		if (mode === 'new') {
			store.addCard(deck.id, front.trim(), back.trim(), example.trim(), hint.trim());
			toasts.show(t('toast.added'));
		} else if (targetId) {
			store.updateCard(targetId, { front: front.trim(), back: back.trim(), example: example.trim(), hint: hint.trim() });
			toasts.show(t('toast.saved'));
		}
		formOpen = false;
	}

	function confirmDelete() {
		if (!targetId) return;
		store.deleteCard(targetId);
		toasts.show(t('toast.deleted'));
		delOpen = false;
		targetId = null;
	}

	function levelLabel(level: number): string {
		return t(`practice.level.${levelKeyFor(level)}` as 'practice.level.zero');
	}
</script>

<svelte:head>
	<title>{deck ? deck.name : t('decks.title')} — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-3 px-1 pt-2">
	<div class="flex items-center justify-between">
		<a href="/decks" class="text-muted-foreground inline-flex items-center gap-1 text-sm font-semibold hover:text-foreground">
			<ArrowLeft class="size-4" /> {t('common.back')}
		</a>
		{#if deck}
			<Button variant="ghost" size="icon" onclick={() => (optOpen = true)} aria-label="Opciók">
				<Ellipsis class="size-5" />
			</Button>
		{/if}
	</div>

	{#if !deck}
		<EmptyState icon={StickyNote} title={t('decks.title')} desc={t('decks.empty.d')} />
	{:else}
		<div>
			<h1 class="truncate text-[26px] leading-tight font-bold tracking-tight">{deck.name}</h1>
			<p class="text-muted-foreground mt-0.5 text-sm">
				{cards.length} {t('decks.cards.n')}{deck.description ? ` · ${deck.description}` : ''}
			</p>
		</div>

		<!-- Tudásszint-fejléc -->
		{#if cards.length > 0}
			<Card class="px-3.5 py-3">
				<p class="text-[15px] font-semibold">{t('decks.mastered')}: {pct}%</p>
				<div class="bg-secondary mt-2 h-2 overflow-hidden rounded-full">
					<div class="bg-primary h-full rounded-full transition-all" style="width: {pct}%"></div>
				</div>
			</Card>
		{/if}

		<div class="flex gap-2">
			<Button variant="outline" class="flex-1" size="lg" onclick={openNew}><Plus class="size-4" /> {t('decks.newCard')}</Button>
			{#if cards.length > 0}
				<Button class="flex-1" size="lg" href="/practice?deck={deck.id}"><Play class="size-4" fill="currentColor" /> {t('decks.study')}</Button>
			{/if}
		</div>

		{#if cards.length === 0}
			<EmptyState icon={StickyNote} title={t('decks.newCard')} desc={t('decks.noCards')} />
		{:else}
			<div class="flex flex-col gap-2">
				{#each cards as card (card.id)}
					<Card class="px-2 py-1">
						<button type="button" onclick={() => openEdit(card.id)} class="press flex w-full items-center gap-3 px-2 py-2 text-left">
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-semibold">{card.front}</span>
								<span class="text-muted-foreground mt-0.5 block truncate text-[13px]">{card.back}</span>
							</span>
							<KnowledgeSignal level={card.level} label={levelLabel(card.level)} />
						</button>
					</Card>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<Dialog bind:open={formOpen} title={mode === 'new' ? t('decks.newCard') : t('decks.editCard')}>
	<div class="flex flex-col gap-3">
		<div>
			<label class="field-label" for="card-front">{t('decks.front')}</label>
			<input id="card-front" class="field" bind:value={front} placeholder={t('decks.frontPh')} maxlength={80} />
		</div>
		<div>
			<label class="field-label" for="card-back">{t('decks.back')}</label>
			<input id="card-back" class="field" bind:value={back} placeholder={t('decks.backPh')} maxlength={80} />
		</div>
		<div>
			<label class="field-label" for="card-hint">{t('decks.hint')}</label>
			<input id="card-hint" class="field" bind:value={hint} placeholder={t('decks.hintPh')} maxlength={80} />
		</div>
		<div>
			<label class="field-label" for="card-ex">{t('decks.example')}</label>
			<input id="card-ex" class="field" bind:value={example} placeholder={t('decks.examplePh')} maxlength={140} />
		</div>
		{#if mode === 'edit' && targetId}
			<button
				type="button"
				onclick={() => {
					formOpen = false;
					delOpen = true;
				}}
				class="text-destructive mt-1 inline-flex items-center gap-1.5 self-start text-sm font-semibold"
			>
				<Trash2 class="size-4" /> {t('common.delete')}
			</button>
		{/if}
		<Button onclick={submit} disabled={!front.trim() || !back.trim()} class="mt-1 w-full">
			{mode === 'new' ? t('common.create') : t('common.save')}
		</Button>
	</div>
</Dialog>

<Dialog bind:open={delOpen} title={t('decks.editCard')} description={t('common.delete')}>
	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={() => (delOpen = false)}>{t('common.cancel')}</Button>
		<Button variant="destructive" class="flex-1" onclick={confirmDelete}>{t('common.delete')}</Button>
	{/snippet}
</Dialog>

<Dialog bind:open={deckDelOpen} title={t('decks.del.t')} description={t('decks.del.d')}>
	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={() => (deckDelOpen = false)}>{t('common.cancel')}</Button>
		<Button
			variant="destructive"
			class="flex-1"
			href="/decks"
			onclick={() => {
				if (deck) store.deleteDeck(deck.id);
				toasts.show(t('toast.deleted'));
			}}>{t('common.delete')}</Button
		>
	{/snippet}
</Dialog>

<Dialog bind:open={optOpen} title={deck?.name ?? ''}>
	<div class="flex flex-col">
		{#if deck && stats}
			<div class="flex items-center gap-3 rounded-xl px-1 py-2.5">
				<StickyNote class="text-muted-foreground size-5" />
				<span class="text-sm">
					{cards.length} {t('decks.cards.n')} · {stats.due} {t('home.dueLabel')}
				</span>
			</div>
			<button
				type="button"
				onclick={() => {
					optOpen = false;
					openNew();
				}}
				class="hover:bg-accent press flex items-center gap-3 rounded-xl px-1 py-2.5 text-left"
			>
				<Plus class="text-muted-foreground size-5" />
				<span class="text-[15px] font-semibold">{t('decks.newCard')}</span>
			</button>
			<button
				type="button"
				onclick={() => {
					optOpen = false;
					deckDelOpen = true;
				}}
				class="hover:bg-destructive/10 hover:text-destructive press flex items-center gap-3 rounded-xl px-1 py-2.5 text-left"
			>
				<Trash2 class="size-5" />
				<span class="text-[15px] font-semibold">{t('decks.del.t')}</span>
			</button>
		{/if}
	</div>
</Dialog>

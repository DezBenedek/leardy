<script lang="ts">
	import { page } from '$app/state';
	import { ArrowLeft, Pencil, Play, Plus, StickyNote, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Dialog } from '$lib/components/ui/dialog/index.js';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { store } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';
	import { toasts } from '$lib/components/ui/toast/toast.svelte.js';

	const id = $derived(page.params.id ?? '');
	const deck = $derived(store.data.decks.find((d) => d.id === id));
	const cards = $derived(store.data.cards.filter((c) => c.deckId === id));

	let mode = $state<'new' | 'edit'>('new');
	let formOpen = $state(false);
	let delOpen = $state(false);
	let targetId = $state<string | null>(null);
	let front = $state('');
	let back = $state('');
	let example = $state('');

	function openNew() {
		front = '';
		back = '';
		example = '';
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
		targetId = cardId;
		mode = 'edit';
		formOpen = true;
	}

	function submit() {
		if (!front.trim() || !back.trim() || !deck) return;
		if (mode === 'new') {
			store.addCard(deck.id, front.trim(), back.trim(), example.trim());
			toasts.show(t('toast.added'));
		} else if (targetId) {
			store.updateCard(targetId, { front: front.trim(), back: back.trim(), example: example.trim() });
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
</script>

<svelte:head>
	<title>{deck ? deck.name : t('decks.title')} — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<a href="/decks" class="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm font-semibold hover:text-foreground">
		<ArrowLeft class="size-4" /> {t('common.back')}
	</a>

	{#if !deck}
		<EmptyState icon={StickyNote} title={t('decks.title')} desc={t('decks.empty.d')} />
	{:else}
		<div class="flex items-end justify-between gap-3">
			<div class="min-w-0">
				<h1 class="font-display truncate text-2xl font-extrabold tracking-tight">{deck.name}</h1>
				<p class="text-muted-foreground mt-1 text-sm">
					{cards.length} {t('decks.cards.n')}{deck.description ? ` · ${deck.description}` : ''}
				</p>
			</div>
			<div class="flex shrink-0 gap-2">
				<Button size="sm" variant="outline" onclick={openNew}><Plus class="size-4" /> {t('decks.newCard')}</Button>
				{#if cards.length > 0}
					<Button size="sm" href="/practice?deck={deck.id}"><Play class="size-4" fill="currentColor" /> {t('decks.study')}</Button>
				{/if}
			</div>
		</div>

		{#if cards.length === 0}
			<EmptyState icon={StickyNote} title={t('decks.newCard')} desc={t('decks.noCards')}>
				<Button size="sm" onclick={openNew}><Plus class="size-4" /> {t('decks.newCard')}</Button>
			</EmptyState>
		{:else}
			<div class="flex flex-col gap-2">
				{#each cards as card (card.id)}
					<Card class="group py-0">
						<div class="flex items-center gap-3 p-4">
							<div class="min-w-0 flex-1">
								<p class="truncate font-bold">{card.front}</p>
								<p class="text-muted-foreground truncate text-sm">{card.back}</p>
								{#if card.example}
									<p class="text-muted-foreground/70 mt-0.5 truncate text-xs italic">“{card.example}”</p>
								{/if}
							</div>
							<div class="flex shrink-0 gap-1">
								<button
									type="button"
									aria-label={t('common.edit')}
									onclick={() => openEdit(card.id)}
									class="hover:bg-accent grid size-9 place-items-center rounded-lg transition-colors"
								>
									<Pencil class="size-4" />
								</button>
								<button
									type="button"
									aria-label={t('common.delete')}
									onclick={() => {
										targetId = card.id;
										delOpen = true;
									}}
									class="hover:bg-destructive/10 hover:text-destructive grid size-9 place-items-center rounded-lg transition-colors"
								>
									<Trash2 class="size-4" />
								</button>
							</div>
						</div>
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
			<label class="field-label" for="card-ex">{t('decks.example')}</label>
			<input id="card-ex" class="field" bind:value={example} placeholder={t('decks.examplePh')} maxlength={140} />
		</div>
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

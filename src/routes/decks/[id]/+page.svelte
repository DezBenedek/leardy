<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Ellipsis, Play, Plus, StickyNote, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card } from '$lib/components/ui/card/index.js';
	import { Dialog } from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { Empty } from '$lib/components/ui/empty/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { levelKeyFor } from '$lib/srs.js';
	import { store } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';

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
			toast.success(t('toast.added'));
		} else if (targetId) {
			store.updateCard(targetId, { front: front.trim(), back: back.trim(), example: example.trim(), hint: hint.trim() });
			toast.success(t('toast.saved'));
		}
		formOpen = false;
	}

	function confirmDelete() {
		if (!targetId) return;
		store.deleteCard(targetId);
		toast.success(t('toast.deleted'));
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
		<Empty icon={StickyNote} title={t('decks.title')} description={t('decks.empty.d')} actionLabel={t('common.back')} actionHref="/decks" />
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
				<div class="flex items-center justify-between gap-2">
					<p class="text-[15px] font-semibold">{t('decks.mastered')}</p>
					<p class="text-muted-foreground text-sm font-bold tabular-nums">{pct}%</p>
				</div>
				<Progress value={pct} max={100} class="mt-2" />
			</Card>
		{/if}

		<div class="flex gap-2">
			<Button variant="outline" class="flex-1" size="lg" onclick={openNew}><Plus class="size-4" /> {t('decks.newCard')}</Button>
			{#if cards.length > 0}
				<Button class="flex-1" size="lg" href="/practice?deck={deck.id}"><Play class="size-4" fill="currentColor" /> {t('decks.study')}</Button>
			{/if}
		</div>

		{#if cards.length === 0}
			<Empty icon={StickyNote} title={t('decks.newCard')} description={t('decks.noCards')} />
		{:else}
			<div class="flex flex-col gap-2">
				{#each cards as card (card.id)}
					<Card class="px-2 py-1">
						<button type="button" onclick={() => openEdit(card.id)} class="press flex w-full items-center gap-3 px-2 py-2 text-left">
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-semibold">{card.front}</span>
								<span class="text-muted-foreground mt-0.5 block truncate text-[13px]">{card.back}</span>
							</span>
							<span class="flex w-20 shrink-0 flex-col items-end gap-1">
								<Progress value={card.level} max={4} class="h-1.5 w-full" />
								<span class="text-muted-foreground text-[11px] font-semibold">{levelLabel(card.level)}</span>
							</span>
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
			<Label for="card-front">{t('decks.front')}</Label>
			<Input id="card-front" bind:value={front} placeholder={t('decks.frontPh')} maxlength={80} />
		</div>
		<div>
			<Label for="card-back">{t('decks.back')}</Label>
			<Input id="card-back" bind:value={back} placeholder={t('decks.backPh')} maxlength={80} />
		</div>
		<div>
			<Label for="card-hint">{t('decks.hint')}</Label>
			<Input id="card-hint" bind:value={hint} placeholder={t('decks.hintPh')} maxlength={80} />
		</div>
		<div>
			<Label for="card-ex">{t('decks.example')}</Label>
			<Input id="card-ex" bind:value={example} placeholder={t('decks.examplePh')} maxlength={140} />
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
			onclick={() => {
				if (deck) store.deleteDeck(deck.id);
				toast.success(t('toast.deleted'));
				deckDelOpen = false;
				goto('/decks');
			}}>{t('common.delete')}</Button
		>
	{/snippet}
</Dialog>

<Dialog bind:open={optOpen} title={deck?.name ?? ''}>
	<div class="flex flex-col">
		{#if deck && stats}
			<div class="flex items-center gap-3 rounded-xl px-1 py-2.5">
				<StickyNote class="text-muted-foreground size-5" />
				<span class="text-sm tabular-nums">
					{cards.length} {t('decks.cards.n')} · {stats.due} {t('home.dueLabel')}
				</span>
			</div>
			<Separator />
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

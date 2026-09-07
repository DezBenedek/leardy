<script lang="ts">
	import { Layers, Pencil, Play, Plus, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Dialog } from '$lib/components/ui/dialog/index.js';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { store, type DeckColor } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';
	import { toasts } from '$lib/components/ui/toast/toast.svelte.js';
	import { cn } from '$lib/utils.js';

	export const TILE: Record<DeckColor, string> = {
		emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
		sky: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
		violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
		amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
		rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400'
	};

	const COLORS: DeckColor[] = ['emerald', 'sky', 'violet', 'amber', 'rose'];

	let mode = $state<'new' | 'edit'>('new');
	let formOpen = $state(false);
	let delOpen = $state(false);
	let targetId = $state<string | null>(null);
	let name = $state('');
	let description = $state('');
	let color = $state<DeckColor>('emerald');

	const decks = $derived(store.data.decks);
	const countOf = (id: string) => store.data.cards.filter((c) => c.deckId === id).length;

	function openNew() {
		name = '';
		description = '';
		color = 'emerald';
		targetId = null;
		mode = 'new';
		formOpen = true;
	}

	function openEdit(id: string) {
		const d = store.data.decks.find((x) => x.id === id);
		if (!d) return;
		name = d.name;
		description = d.description;
		color = d.color;
		targetId = id;
		mode = 'edit';
		formOpen = true;
	}

	function submit() {
		if (!name.trim()) return;
		if (mode === 'new') {
			store.addDeck(name.trim(), description.trim(), color);
			toasts.show(t('toast.added'));
		} else if (targetId) {
			store.updateDeck(targetId, { name: name.trim(), description: description.trim(), color });
			toasts.show(t('toast.saved'));
		}
		formOpen = false;
	}

	function confirmDelete() {
		if (!targetId) return;
		store.deleteDeck(targetId);
		toasts.show(t('toast.deleted'));
		delOpen = false;
		targetId = null;
	}
</script>

<svelte:head>
	<title>{t('decks.title')} — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<div class="flex items-end justify-between gap-3">
		<div>
			<h1 class="font-display text-2xl font-extrabold tracking-tight">{t('decks.title')}</h1>
			<p class="text-muted-foreground mt-1 text-sm">{t('decks.sub')}</p>
		</div>
		<Button size="sm" onclick={openNew}><Plus class="size-4" /> {t('decks.new')}</Button>
	</div>

	{#if decks.length === 0}
		<EmptyState icon={Layers} title={t('decks.empty.t')} desc={t('decks.empty.d')}>
			<Button size="sm" onclick={openNew}><Plus class="size-4" /> {t('decks.new')}</Button>
		</EmptyState>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2">
			{#each decks as deck (deck.id)}
				<Card class="card-lift group relative overflow-hidden py-0">
					<a href="/decks/{deck.id}" class="press block p-5">
						<div class="flex items-start gap-3">
							<span class="grid size-12 shrink-0 place-items-center rounded-2xl {TILE[deck.color]}">
								<Layers class="size-6" strokeWidth={2.2} />
							</span>
							<div class="min-w-0 flex-1">
								<h2 class="truncate font-bold">{deck.name}</h2>
								<p class="text-muted-foreground mt-0.5 line-clamp-2 text-[13px]">
									{deck.description || `${countOf(deck.id)} ${t('decks.cards.n')}`}
								</p>
								<p class="text-muted-foreground mt-2 text-xs font-bold">
									{countOf(deck.id)} {t('decks.cards.n')}
								</p>
							</div>
						</div>
						<span class="bg-primary text-primary-foreground mt-4 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-bold">
							<Play class="size-3.5" fill="currentColor" /> {t('decks.study')}
						</span>
					</a>
					<div class="absolute top-3 right-3 flex gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
						<button
							type="button"
							aria-label={t('common.edit')}
							onclick={() => openEdit(deck.id)}
							class="bg-card/90 hover:bg-accent grid size-8 place-items-center rounded-lg border shadow-xs backdrop-blur"
						>
							<Pencil class="size-4" />
						</button>
						<button
							type="button"
							aria-label={t('common.delete')}
							onclick={() => {
								targetId = deck.id;
								delOpen = true;
							}}
							class="bg-card/90 hover:bg-destructive/10 hover:text-destructive grid size-8 place-items-center rounded-lg border shadow-xs backdrop-blur"
						>
							<Trash2 class="size-4" />
						</button>
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>

<Dialog bind:open={formOpen} title={mode === 'new' ? t('decks.new.t') : t('decks.edit.t')}>
	<div class="flex flex-col gap-3">
		<div>
			<label class="field-label" for="deck-name">{t('decks.name')}</label>
			<input id="deck-name" class="field" bind:value={name} placeholder={t('decks.namePh')} maxlength={60} />
		</div>
		<div>
			<label class="field-label" for="deck-desc">{t('decks.desc')}</label>
			<input id="deck-desc" class="field" bind:value={description} placeholder={t('decks.descPh')} maxlength={120} />
		</div>
		<div>
			<span class="field-label">Szín</span>
			<div class="flex gap-2">
				{#each COLORS as c (c)}
					<button
						type="button"
						aria-label={c}
						onclick={() => (color = c)}
						class={cn(
							'grid size-10 place-items-center rounded-xl transition-all',
							TILE[c],
							color === c ? 'ring-ring ring-2 ring-offset-2 ring-offset-card' : 'opacity-60 hover:opacity-100'
						)}
					>
						<Layers class="size-5" />
					</button>
				{/each}
			</div>
		</div>
		<Button onclick={submit} disabled={!name.trim()} class="mt-1 w-full">
			{mode === 'new' ? t('common.create') : t('common.save')}
		</Button>
	</div>
</Dialog>

<Dialog bind:open={delOpen} title={t('decks.del.t')} description={t('decks.del.d')}>
	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={() => (delOpen = false)}>{t('common.cancel')}</Button>
		<Button variant="destructive" class="flex-1" onclick={confirmDelete}>{t('common.delete')}</Button>
	{/snippet}
</Dialog>

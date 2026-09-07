<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { ChevronRight, Layers, Pencil, Play, Plus, Search, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card } from '$lib/components/ui/card/index.js';
	import { Dialog } from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Tabs } from '$lib/components/ui/tabs/index.js';
	import { Empty } from '$lib/components/ui/empty/index.js';
	import { store, type DeckColor } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';
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
	let subjOpen = $state(false);
	let targetId = $state<string | null>(null);
	let name = $state('');
	let description = $state('');
	let color = $state<DeckColor>('emerald');
	let subjectId = $state('');
	let subjName = $state('');
	let search = $state('');
	let subjectFilter = $state('all');

	const subjects = $derived(store.data.subjects);
	const dueMap = $derived(new Map(store.dueDeckIds().map((r) => [r.id, r.due])));
	const activeSubject = $derived(subjectFilter === 'all' ? null : subjectFilter);

	$effect(() => {
		if (!subjectId && subjects.length > 0) subjectId = subjects[0].id;
	});

	const subjectTabs = $derived([
		{ value: 'all', label: `${t('decks.allSubjects')} · ${store.data.decks.length}` },
		...subjects.map((s) => ({
			value: s.id,
			label: `${s.name} · ${store.data.decks.filter((d) => d.subjectId === s.id).length}`
		}))
	]);

	const subjectOptions = $derived(subjects.map((s) => ({ value: s.id, label: s.name })));

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return store.data.decks.filter((d) => {
			if (activeSubject && d.subjectId !== activeSubject) return false;
			if (!q) return true;
			if (d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)) return true;
			return store.data.cards.some(
				(c) =>
					c.deckId === d.id &&
					(c.front.toLowerCase().includes(q) ||
						c.back.toLowerCase().includes(q) ||
						(c.hint && c.hint.toLowerCase().includes(q)))
			);
		});
	});

	const countOf = (id: string) => store.data.cards.filter((c) => c.deckId === id).length;
	const subjectOf = (id: string) => subjects.find((s) => s.id === id);

	function openNew() {
		name = '';
		description = '';
		color = 'emerald';
		subjectId = activeSubject ?? subjects[0]?.id ?? '';
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
		subjectId = d.subjectId;
		targetId = id;
		mode = 'edit';
		formOpen = true;
	}

	function submit() {
		if (!name.trim() || !subjectId) return;
		if (mode === 'new') {
			store.addDeck(name.trim(), description.trim(), color, subjectId);
			toast.success(t('toast.added'));
		} else if (targetId) {
			store.updateDeck(targetId, { name: name.trim(), description: description.trim(), color, subjectId });
			toast.success(t('toast.saved'));
		}
		formOpen = false;
	}

	function confirmDelete() {
		if (!targetId) return;
		store.deleteDeck(targetId);
		toast.success(t('toast.deleted'));
		delOpen = false;
		targetId = null;
	}

	const SUBJ_COLORS = ['slate', 'ochre', 'forest', 'wine'] as const;

	function submitSubject() {
		if (!subjName.trim()) return;
		const nextColor = SUBJ_COLORS[subjects.length % SUBJ_COLORS.length];
		const created = store.addSubject(subjName.trim(), nextColor);
		subjectFilter = created.id;
		toast.success(t('toast.added'));
		subjOpen = false;
		subjName = '';
	}
</script>

<svelte:head>
	<title>{t('decks.title')} — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-3 px-1 pt-2">
	<div class="flex items-end justify-between gap-3 px-1">
		<div>
			<h1 class="text-[26px] leading-tight font-bold tracking-tight">{t('decks.title')}</h1>
			<p class="text-muted-foreground mt-0.5 text-sm">{t('decks.sub')}</p>
		</div>
		<div class="flex shrink-0 gap-2">
			<Button size="sm" variant="outline" onclick={() => (subjOpen = true)}>{t('decks.newSubject')}</Button>
			<Button size="sm" onclick={openNew}><Plus class="size-4" /> {t('decks.new')}</Button>
		</div>
	</div>

	<!-- Keresés -->
	<div class="relative">
		<Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2" />
		<Input bind:value={search} placeholder={t('decks.searchPh')} autocomplete="off" class="pr-4 pl-10" />
	</div>

	<!-- Tantárgy-szűrő -->
	{#if subjects.length > 0}
		<Tabs bind:value={subjectFilter} tabs={subjectTabs} />
	{/if}

	{#if filtered.length === 0}
		<Empty
			icon={Layers}
			title={search.trim() ? t('decks.noResults') : t('decks.empty.t')}
			description={search.trim() ? '' : t('decks.empty.d')}
		/>
	{:else}
		<div class="stagger flex flex-col gap-2">
			{#each filtered as deck (deck.id)}
				{@const due = dueMap.get(deck.id) ?? 0}
				<Card class="card-lift group relative flex-row items-center gap-2 px-4 py-3.5">
					<a href="/decks/{deck.id}" class="press flex min-w-0 flex-1 items-center gap-3">
						<span class="grid size-11 shrink-0 place-items-center rounded-2xl {TILE[deck.color]}">
							<Layers class="size-5" strokeWidth={2.2} />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[15px] font-semibold">{deck.name}</span>
							<span class="text-muted-foreground mt-0.5 block text-[13px]">
								{subjectOf(deck.subjectId)?.name ?? ''}{subjectOf(deck.subjectId) ? ' · ' : ''}{countOf(
									deck.id
								)}
								{t('decks.cards.n')}{due > 0 ? ` · ${due} ${t('home.dueLabel')}` : ''}
							</span>
						</span>
						<ChevronRight class="text-muted-foreground size-5 shrink-0" />
					</a>
					{#if due > 0}
						<a
							href="/practice?deck={deck.id}"
							aria-label="{t('home.startPractice')}: {deck.name}"
							class="press text-primary grid size-10 shrink-0 place-items-center rounded-full"
							style="background: color-mix(in srgb, var(--primary) 12%, transparent)"
						>
							<Play class="size-5" fill="currentColor" />
						</a>
					{/if}
					<span class="absolute top-2.5 right-2.5 flex gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
						<button
							type="button"
							aria-label={t('common.edit')}
							onclick={() => openEdit(deck.id)}
							class="bg-card/90 hover:bg-accent grid size-8 place-items-center rounded-lg border backdrop-blur"
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
							class="bg-card/90 hover:bg-destructive/10 hover:text-destructive grid size-8 place-items-center rounded-lg border backdrop-blur"
						>
							<Trash2 class="size-4" />
						</button>
					</span>
				</Card>
			{/each}
		</div>
	{/if}
</div>

<Dialog bind:open={formOpen} title={mode === 'new' ? t('decks.new.t') : t('decks.edit.t')}>
	<div class="flex flex-col gap-3">
		<div>
			<Label for="deck-name">{t('decks.name')}</Label>
			<Input id="deck-name" bind:value={name} placeholder={t('decks.namePh')} maxlength={60} />
		</div>
		<div>
			<Label for="deck-desc">{t('decks.desc')}</Label>
			<Input id="deck-desc" bind:value={description} placeholder={t('decks.descPh')} maxlength={120} />
		</div>
		<div>
			<Label for="deck-subj">{t('decks.assignSubject')}</Label>
			<Select bind:value={subjectId} options={subjectOptions} />
		</div>
		<div>
			<Label>Szín</Label>
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
		<Button onclick={submit} disabled={!name.trim() || !subjectId} class="mt-1 w-full">
			{mode === 'new' ? t('common.create') : t('common.save')}
		</Button>
	</div>
</Dialog>

<Dialog bind:open={subjOpen} title={t('decks.newSubject')}>
	<div class="flex flex-col gap-3">
		<div>
			<Label for="subj-name">{t('decks.subjectName')}</Label>
			<Input id="subj-name" bind:value={subjName} placeholder={t('decks.subjectNamePh')} maxlength={40} />
		</div>
		<Button onclick={submitSubject} disabled={!subjName.trim()} class="w-full">{t('common.create')}</Button>
	</div>
</Dialog>

<Dialog bind:open={delOpen} title={t('decks.del.t')} description={t('decks.del.d')}>
	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={() => (delOpen = false)}>{t('common.cancel')}</Button>
		<Button variant="destructive" class="flex-1" onclick={confirmDelete}>{t('common.delete')}</Button>
	{/snippet}
</Dialog>

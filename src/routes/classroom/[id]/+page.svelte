<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ArrowLeft, BookOpen, Crown, Layers, Play, Plus, Share2, Ticket, Trash2, Trophy, Users } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Dialog } from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Avatar } from '$lib/components/ui/avatar/index.js';
	import { store } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';
	import { cn } from '$lib/utils.js';

	const id = $derived(page.params.id ?? '');
	const group = $derived(store.data.groups.find((g) => g.id === id));
	const myDecks = $derived(store.data.decks);
	const sharedDecks = $derived(group ? store.data.decks.filter((d) => group.sharedDeckIds.includes(d.id)) : []);
	const results = $derived(
		store.data.results.filter((r) => r.scope === 'doga' && group?.sharedDeckIds.includes(r.refId))
	);

	let shareOpen = $state(false);
	let dogaOpen = $state(false);
	let matOpen = $state(false);
	let matTitle = $state('');
	let matUrl = $state('');
	let matNote = $state('');
	let dogaDeck = $state('');
	let dogaCount = $state(10);
	let dogaSecs = $state(20);

	const deckOptions = $derived(sharedDecks.map((d) => ({ value: d.id, label: d.name })));

	$effect(() => {
		if (!dogaOpen) return;
		// Elavult választás ejtése (pl. törölt pakli), különben érvénytelen doga indulna.
		if (dogaDeck && !sharedDecks.some((d) => d.id === dogaDeck)) dogaDeck = '';
		if (!dogaDeck && sharedDecks.length > 0) dogaDeck = sharedDecks[0].id;
	});

	function share(deckId: string) {
		if (!group) return;
		store.shareDeck(group.id, deckId);
		toast.success(t('toast.added'));
		shareOpen = false;
	}

	function startDoga() {
		if (!group || !dogaDeck) return;
		goto(`/classroom/${group.id}/doga?deck=${dogaDeck}&n=${dogaCount}&s=${dogaSecs}`);
	}

	function openMaterial() {
		matTitle = '';
		matUrl = '';
		matNote = '';
		matOpen = true;
	}

	function submitMaterial() {
		if (!group || !matTitle.trim()) return;
		let url = matUrl.trim();
		// Csupa domain jellegű bevitelnél pótoljuk a sémát, különben relatív linkként törne.
		if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
		store.addMaterial(group.id, matTitle.trim(), url, matNote.trim());
		toast.success(t('toast.added'));
		matOpen = false;
	}

	function medal(i: number): string {
		return i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-muted-foreground/40';
	}
</script>

<svelte:head>
	<title>{group ? group.name : t('class.title')} — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<a href="/classroom" class="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm font-semibold hover:text-foreground">
		<ArrowLeft class="size-4" /> {t('common.back')}
	</a>

	{#if !group}
		<Card class="py-10">
			<CardContent class="flex flex-col items-center gap-2 text-center">
				<p class="text-muted-foreground text-sm">…</p>
				<Button variant="outline" href="/classroom">{t('common.back')}</Button>
			</CardContent>
		</Card>
	{:else}
		<!-- Fejléc -->
		<Card class="hero border-0 py-5 text-white">
			<CardContent class="flex items-center gap-4">
				<span class="font-display grid size-14 shrink-0 place-items-center rounded-2xl bg-white/20 text-2xl font-extrabold backdrop-blur-sm">
					{group.name.charAt(0).toUpperCase()}
				</span>
				<div class="min-w-0 flex-1">
					<h1 class="font-display truncate text-xl font-extrabold">{group.name}</h1>
					<p class="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-white/80">
						<span class="inline-flex items-center gap-1"><Users class="size-3.5" /> {group.members.length} {t('class.members').toLowerCase()}</span>
						<Badge class="border-white/30 bg-white/20 font-mono text-white"><Ticket class="size-3.5" /> {group.code}</Badge>
					</p>
				</div>
			</CardContent>
		</Card>

		<!-- Tagok -->
		<div>
			<h2 class="mb-2 text-sm font-bold tracking-wide">{t('class.members')}</h2>
			<Card class="py-2">
				<CardContent class="flex flex-col px-2">
					{#each [...group.members].sort((a, b) => b.xp - a.xp) as m, i (m.id)}
						<div class="flex items-center gap-3 rounded-xl px-3 py-2.5">
							<span class={cn('w-5 text-center text-sm font-extrabold tabular-nums', medal(i))}>{i + 1}</span>
							<Avatar initials={(m.name || '?').charAt(0).toUpperCase()} />
							<span class="min-w-0 flex-1 truncate text-sm font-bold">
								{m.you ? (m.name || t('common.you')) : m.name}
								{#if m.you}<Badge variant="secondary" class="ml-1.5">{t('common.you')}</Badge>{/if}
							</span>
							{#if group.ownerId === m.id}
								<Crown class="size-4 text-amber-500" aria-label={t('class.owner')} />
							{/if}
							<span class="text-muted-foreground text-xs font-bold tabular-nums">{m.xp} XP</span>
						</div>
					{/each}
				</CardContent>
			</Card>
		</div>

		<!-- Megosztott csomagok -->
		<div>
			<div class="mb-2 flex items-center justify-between">
				<h2 class="text-sm font-bold tracking-wide">{t('class.shared')}</h2>
				<Button size="sm" variant="outline" onclick={() => (shareOpen = true)}><Share2 class="size-4" /> {t('class.share')}</Button>
			</div>
			{#if sharedDecks.length === 0}
				<Card class="py-6">
					<CardContent class="text-muted-foreground text-center text-sm">—</CardContent>
				</Card>
			{:else}
				<div class="grid gap-2 sm:grid-cols-2">
					{#each sharedDecks as d (d.id)}
						<a href="/decks/{d.id}" class="press">
							<Card class="card-lift flex-row items-center gap-3 py-3.5">
								<span class="bg-primary/10 grid size-10 shrink-0 place-items-center rounded-xl">
									<Layers class="text-primary size-5" />
								</span>
								<span class="min-w-0">
									<span class="block truncate text-sm font-bold">{d.name}</span>
									<span class="text-muted-foreground block text-xs font-semibold tabular-nums">
										{store.data.cards.filter((c) => c.deckId === d.id).length} {t('decks.cards.n')}
									</span>
								</span>
							</Card>
						</a>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Doga -->
		<Button size="xl" class="w-full text-base" disabled={sharedDecks.length === 0} onclick={() => (dogaOpen = true)}>
			<Play class="size-4" fill="currentColor" /> {t('class.startDoga')}
		</Button>

		<!-- Tananyagok -->
		<div>
			<div class="mb-2 flex items-center justify-between">
				<h2 class="flex items-center gap-1.5 text-sm font-bold tracking-wide">
					<BookOpen class="size-4 text-primary" /> {t('class.materials')}
				</h2>
				<Button size="sm" variant="outline" onclick={() => (matOpen = true)}><Plus class="size-4" /> {t('class.addMaterial')}</Button>
			</div>
			{#if !group.materials || group.materials.length === 0}
				<Card class="py-6">
					<CardContent class="text-muted-foreground text-center text-sm">{t('class.noMaterials')}</CardContent>
				</Card>
			{:else}
				<Card class="py-2">
					<CardContent class="flex flex-col px-2">
						{#each group.materials as m (m.id)}
							<div class="flex items-center gap-3 rounded-xl px-3 py-2.5">
								<span class="min-w-0 flex-1">
									{#if m.url}
										<a href={m.url} target="_blank" rel="noreferrer" class="text-primary block truncate text-sm font-semibold underline underline-offset-2">{m.title}</a>
									{:else}
										<span class="block truncate text-sm font-semibold">{m.title}</span>
									{/if}
									{#if m.note}<span class="text-muted-foreground block truncate text-xs">{m.note}</span>{/if}
								</span>
								<Button
									variant="ghost"
									size="icon"
									aria-label={t('common.delete')}
									onclick={() => group && store.deleteMaterial(group.id, m.id)}
									class="hover:bg-destructive/10 hover:text-destructive size-8 shrink-0"
								>
									<Trash2 class="size-4" />
								</Button>
							</div>
						{/each}
					</CardContent>
				</Card>
			{/if}
		</div>

		<!-- Korábbi dogák -->
		<div>
			<h2 class="mb-2 flex items-center gap-1.5 text-sm font-bold tracking-wide">
				<Trophy class="size-4 text-amber-500" /> {t('class.results')}
			</h2>
			{#if results.length === 0}
				<Card class="py-6">
					<CardContent class="text-muted-foreground text-center text-sm">{t('class.noResults')}</CardContent>
				</Card>
			{:else}
				<Card class="py-2">
					<CardContent class="flex flex-col px-2">
						{#each results.slice(0, 8) as r (r.id)}
							<div class="flex items-center gap-3 rounded-xl px-3 py-2.5">
								<span class="min-w-0 flex-1 truncate text-sm font-semibold">
									{r.refName} <span class="text-muted-foreground font-normal">· {r.memberName}</span>
								</span>
								<span class="text-xs font-extrabold tabular-nums {r.score / r.total >= 0.7 ? 'text-forest' : 'text-muted-foreground'}">
									{r.score}{t('common.of')}{r.total}
								</span>
								<span class="text-xp text-xs font-bold tabular-nums">+{r.xp}</span>
							</div>
						{/each}
					</CardContent>
				</Card>
			{/if}
		</div>
	{/if}
</div>

<Dialog bind:open={shareOpen} title={t('class.share.t')} description={t('class.share.d')}>
	<div class="flex flex-col gap-2">
		{#each myDecks.filter((d) => !(group?.sharedDeckIds.includes(d.id) ?? false)) as d (d.id)}
			<button
				type="button"
				onclick={() => share(d.id)}
				class="press hover:border-primary/50 flex items-center gap-3 rounded-2xl border p-3 text-left"
			>
				<span class="bg-primary/10 grid size-10 shrink-0 place-items-center rounded-xl">
					<Layers class="text-primary size-5" />
				</span>
				<span class="min-w-0">
					<span class="block truncate text-sm font-bold">{d.name}</span>
					<span class="text-muted-foreground block text-xs tabular-nums">{store.data.cards.filter((c) => c.deckId === d.id).length} {t('decks.cards.n')}</span>
				</span>
			</button>
		{:else}
			<p class="text-muted-foreground py-4 text-center text-sm">—</p>
		{/each}
	</div>
</Dialog>

<Dialog bind:open={dogaOpen} title={t('class.doga.t')}>
	<div class="flex flex-col gap-4">
		<div>
			<Label>{t('class.deck')}</Label>
			<Select bind:value={dogaDeck} options={deckOptions} />
		</div>
		<div>
			<Label>{t('class.count')}</Label>
			<div class="grid grid-cols-3 gap-2">
				{#each [5, 10, 15] as n (n)}
					<button
						type="button"
						onclick={() => (dogaCount = n)}
						class={cn('press rounded-xl border py-2.5 text-sm font-extrabold tabular-nums', dogaCount === n ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}
					>
						{n}
					</button>
				{/each}
			</div>
		</div>
		<div>
			<Label>{t('class.time')}</Label>
			<div class="grid grid-cols-3 gap-2">
				{#each [10, 20, 30] as s (s)}
					<button
						type="button"
						onclick={() => (dogaSecs = s)}
						class={cn('press rounded-xl border py-2.5 text-sm font-extrabold tabular-nums', dogaSecs === s ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}
					>
						{s} {t('class.sec')}
					</button>
				{/each}
			</div>
		</div>
		<Button class="w-full" disabled={!dogaDeck} onclick={startDoga}>
			<Play class="size-4" fill="currentColor" /> {t('class.lobby.t')}
		</Button>
	</div>
</Dialog>

<Dialog bind:open={matOpen} title={t('class.addMaterial')}>
	<div class="flex flex-col gap-3">
		<div>
			<Label for="mat-title">{t('class.matTitle')}</Label>
			<Input id="mat-title" bind:value={matTitle} maxlength={80} />
		</div>
		<div>
			<Label for="mat-url">{t('class.matUrl')}</Label>
			<Input id="mat-url" bind:value={matUrl} inputmode="url" placeholder="https://" maxlength={200} />
		</div>
		<div>
			<Label for="mat-note">{t('class.matNote')}</Label>
			<Input id="mat-note" bind:value={matNote} maxlength={140} />
		</div>
		<Button onclick={submitMaterial} disabled={!matTitle.trim()} class="w-full">{t('common.create')}</Button>
	</div>
</Dialog>

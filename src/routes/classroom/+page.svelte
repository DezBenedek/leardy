<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Plus, School, Ticket, UserPlus, Users } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card } from '$lib/components/ui/card/index.js';
	import { Dialog } from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Empty } from '$lib/components/ui/empty/index.js';
	import { store } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';

	let joinOpen = $state(false);
	let createOpen = $state(false);
	let code = $state('');
	let groupName = $state('');

	const groups = $derived(store.data.groups);

	function join() {
		const res = store.joinGroup(code);
		if (!res.ok && res.reason === 'invalid') {
			toast.error(t('class.invalid'));
			return;
		}
		if (!res.ok) {
			toast.info(t('class.already'));
			joinOpen = false;
			return;
		}
		toast.success(t('class.joined'));
		joinOpen = false;
		code = '';
	}

	function create() {
		if (!groupName.trim()) return;
		const g = store.createGroup(groupName.trim());
		toast.success(`${t('class.created')} ${g.code}`, { description: g.name });
		createOpen = false;
		groupName = '';
	}
</script>

<svelte:head>
	<title>{t('class.title')} — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<div class="flex items-end justify-between gap-3">
		<div>
			<h1 class="font-display text-2xl font-extrabold tracking-tight">{t('class.title')}</h1>
			<p class="text-muted-foreground mt-1 text-sm">{t('class.sub')}</p>
		</div>
		<div class="flex shrink-0 gap-2">
			<Button size="sm" variant="outline" onclick={() => (createOpen = true)}><Plus class="size-4" /> {t('class.new')}</Button>
			<Button size="sm" onclick={() => (joinOpen = true)}><UserPlus class="size-4" /> {t('class.join')}</Button>
		</div>
	</div>

	{#if groups.length === 0}
		<Empty icon={School} title={t('class.empty.t')} description={t('class.empty.d')} />
		<Button size="sm" class="w-fit self-center" onclick={() => (joinOpen = true)}><Ticket class="size-4" /> {t('class.join')}</Button>
	{:else}
		<div class="stagger grid gap-3">
			{#each groups as g (g.id)}
				<a href="/classroom/{g.id}" class="group press">
					<Card class="card-lift flex-row items-center gap-4 py-4">
						<span class="bg-primary text-primary-foreground font-display grid size-12 shrink-0 place-items-center rounded-2xl text-lg font-bold">
							{g.name.charAt(0).toUpperCase()}
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate font-bold">{g.name}</p>
							<p class="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs font-semibold">
								<span class="inline-flex items-center gap-1"><Users class="size-3.5" /> {g.members.length}</span>
								<span class="inline-flex items-center gap-1 font-mono"><Ticket class="size-3.5" /> {g.code}</span>
							</p>
						</div>
					</Card>
				</a>
			{/each}
		</div>
	{/if}
</div>

<Dialog bind:open={joinOpen} title={t('class.join.t')} description={t('class.join.d')}>
	<form
		onsubmit={(e) => {
			e.preventDefault();
			join();
		}}
		class="flex flex-col gap-3"
	>
		<div>
			<Label for="join-code">{t('class.code')}</Label>
			<Input id="join-code" bind:value={code} placeholder={t('class.codePh')} maxlength={12} autocomplete="off" class="uppercase" />
		</div>
		<Button type="submit" disabled={!code.trim()} class="w-full">{t('common.join')}</Button>
		<p class="text-muted-foreground text-xs">Demo kód: <button type="button" class="font-bold text-primary" onclick={() => (code = 'A1-ESTI')}>A1-ESTI</button></p>
	</form>
</Dialog>

<Dialog bind:open={createOpen} title={t('class.new.t')}>
	<div class="flex flex-col gap-3">
		<div>
			<Label for="group-name">{t('class.groupName')}</Label>
			<Input id="group-name" bind:value={groupName} placeholder={t('class.groupNamePh')} maxlength={60} />
		</div>
		<Button onclick={create} disabled={!groupName.trim()} class="w-full">{t('common.create')}</Button>
	</div>
</Dialog>

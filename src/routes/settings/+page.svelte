<script lang="ts">
	import { Bell, Download, Flame, Globe, Moon, Sun, Trash2, Upload, User } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Dialog } from '$lib/components/ui/dialog/index.js';
	import { store, type Lang } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';
	import { toasts } from '$lib/components/ui/toast/toast.svelte.js';
	import { cn } from '$lib/utils.js';

	const profile = $derived(store.data.profile);
	const dark = $derived(typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));

	let nameOpen = $state(false);
	let resetOpen = $state(false);
	let name = $state('');
	let fileInput: HTMLInputElement | null = null;

	function openName() {
		name = profile.name;
		nameOpen = true;
	}

	function saveName() {
		store.setProfile({ name: name.trim() });
		toasts.show(t('set.saved'));
		nameOpen = false;
	}

	function toggleTheme() {
		const isDark = document.documentElement.classList.toggle('dark');
		try {
			localStorage.setItem('leardy-theme', isDark ? 'dark' : 'light');
		} catch {
			/* privát mód */
		}
	}

	function setLang(lang: Lang) {
		store.setProfile({ lang });
		try {
			document.documentElement.lang = lang;
		} catch {
			/* ssr */
		}
	}

	function setGoal(n: number) {
		store.setProfile({ dailyGoal: n });
	}

	function doExport() {
		const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `leardy-export-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function doImport(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const parsed = JSON.parse(String(reader.result));
				if (!parsed || typeof parsed !== 'object' || !parsed.profile || !Array.isArray(parsed.cards)) {
					throw new Error('bad shape');
				}
				store.replace(parsed);
				toasts.show(t('set.imported'));
			} catch {
				toasts.show(t('set.importFail'));
			}
			input.value = '';
		};
		reader.readAsText(file);
	}

	function doReset() {
		store.reset();
		resetOpen = false;
		toasts.show(t('toast.deleted'));
	}

	const goals = [5, 10, 15, 20];
</script>

<svelte:head>
	<title>{t('set.title')} — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<div>
		<h1 class="font-display text-2xl font-extrabold tracking-tight">{t('set.title')}</h1>
		<p class="text-muted-foreground mt-1 text-sm">{t('set.sub')}</p>
	</div>

	<!-- Profil -->
	<Card class="flex-row items-center gap-4 py-4">
		<span class="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-extrabold text-white">
			{(profile.name || '?').charAt(0).toUpperCase()}
		</span>
		<div class="min-w-0 flex-1">
			<p class="truncate font-bold">{profile.name || t('set.guest')}</p>
			<p class="text-muted-foreground truncate text-[13px]">{profile.xp} XP · <Flame class="text-streak inline size-3.5" fill="currentColor" /> {profile.streak}</p>
		</div>
		<Button size="sm" onclick={openName}>{profile.name ? t('common.edit') : t('set.login')}</Button>
	</Card>

	<!-- Fiók-szerű sorok -->
	<Card class="py-2">
		<CardContent class="flex flex-col px-2">
			<button
				type="button"
				onclick={openName}
				class="hover:bg-accent press flex items-center gap-3 rounded-xl px-3 py-3 text-left"
			>
				<span class="bg-muted grid size-9 shrink-0 place-items-center rounded-lg"><User class="size-[18px]" /></span>
				<span class="flex-1">
					<span class="block text-sm font-bold">{t('set.account')}</span>
					<span class="text-muted-foreground block text-xs">{profile.name || t('set.guest.d')}</span>
				</span>
			</button>

			<button
				type="button"
				onclick={toggleTheme}
				class="hover:bg-accent press flex items-center gap-3 rounded-xl px-3 py-3 text-left"
			>
				<span class="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
					{#if dark}<Sun class="size-[18px]" />{:else}<Moon class="size-[18px]" />{/if}
				</span>
				<span class="flex-1">
					<span class="block text-sm font-bold">{t('set.theme')}</span>
					<span class="text-muted-foreground block text-xs">{dark ? t('set.dark') : t('set.light')}</span>
				</span>
			</button>

			<div class="flex items-center gap-3 rounded-xl px-3 py-3 opacity-70">
				<span class="bg-muted grid size-9 shrink-0 place-items-center rounded-lg"><Bell class="size-[18px]" /></span>
				<span class="flex-1">
					<span class="block text-sm font-bold">Emlékeztetők</span>
					<span class="text-muted-foreground block text-xs">{t('common.soon')}</span>
				</span>
			</div>
		</CardContent>
	</Card>

	<!-- Nyelv -->
	<Card class="py-4">
		<CardContent class="flex items-center gap-3">
			<span class="bg-muted grid size-9 shrink-0 place-items-center rounded-lg"><Globe class="size-[18px]" /></span>
			<span class="flex-1">
				<span class="block text-sm font-bold">{t('set.lang')}</span>
				<span class="text-muted-foreground block text-xs">{t('set.lang.d')}</span>
			</span>
			<div class="flex overflow-hidden rounded-xl border text-sm font-bold">
				<button
					type="button"
					onclick={() => setLang('hu')}
					class={cn('press px-4 py-2', profile.lang === 'hu' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
				>
					HU
				</button>
				<button
					type="button"
					onclick={() => setLang('en')}
					class={cn('press px-4 py-2', profile.lang === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
				>
					EN
				</button>
			</div>
		</CardContent>
	</Card>

	<!-- Napi cél -->
	<Card class="py-4">
		<CardContent class="flex flex-col gap-3">
			<div>
				<p class="text-sm font-bold">{t('set.goal')}: {profile.dailyGoal}</p>
				<p class="text-muted-foreground text-xs">{profile.dailyGoal} {t('set.goal.d')}</p>
			</div>
			<div class="grid grid-cols-4 gap-2">
				{#each goals as g (g)}
					<button
						type="button"
						onclick={() => setGoal(g)}
						class={cn('press rounded-xl border py-2.5 text-sm font-extrabold', profile.dailyGoal === g ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}
					>
						{g}
					</button>
				{/each}
			</div>
		</CardContent>
	</Card>

	<!-- Adatok -->
	<Card class="py-2">
		<CardContent class="flex flex-col px-2">
			<button type="button" onclick={doExport} class="hover:bg-accent press flex items-center gap-3 rounded-xl px-3 py-3 text-left">
				<span class="bg-muted grid size-9 shrink-0 place-items-center rounded-lg"><Download class="size-[18px]" /></span>
				<span class="flex-1">
					<span class="block text-sm font-bold">{t('set.export')}</span>
					<span class="text-muted-foreground block text-xs">{t('set.export.d')}</span>
				</span>
			</button>
			<button type="button" onclick={() => fileInput?.click()} class="hover:bg-accent press flex items-center gap-3 rounded-xl px-3 py-3 text-left">
				<span class="bg-muted grid size-9 shrink-0 place-items-center rounded-lg"><Upload class="size-[18px]" /></span>
				<span class="flex-1">
					<span class="block text-sm font-bold">{t('set.import')}</span>
					<span class="text-muted-foreground block text-xs">{t('set.import.d')}</span>
				</span>
			</button>
			<input bind:this={fileInput} type="file" accept="application/json" class="hidden" onchange={doImport} />
			<button
				type="button"
				onclick={() => (resetOpen = true)}
				class="hover:bg-destructive/10 hover:text-destructive press flex items-center gap-3 rounded-xl px-3 py-3 text-left"
			>
				<span class="bg-muted grid size-9 shrink-0 place-items-center rounded-lg"><Trash2 class="size-[18px]" /></span>
				<span class="flex-1">
					<span class="block text-sm font-bold">{t('set.reset')}</span>
					<span class="text-muted-foreground block text-xs">{t('set.reset.d')}</span>
				</span>
			</button>
		</CardContent>
	</Card>
</div>

<Dialog bind:open={nameOpen} title={t('set.name')}>
	<div class="flex flex-col gap-3">
		<input class="field" bind:value={name} placeholder={t('set.namePh')} maxlength={30} />
		<Button onclick={saveName} disabled={!name.trim()} class="w-full">{t('set.login')}</Button>
	</div>
</Dialog>

<Dialog bind:open={resetOpen} title={t('set.reset.t')} description={t('set.reset.d')}>
	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={() => (resetOpen = false)}>{t('common.cancel')}</Button>
		<Button variant="destructive" class="flex-1" onclick={doReset}>{t('set.reset.yes')}</Button>
	{/snippet}
</Dialog>

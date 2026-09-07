<script lang="ts">
	import { Bell, Check, ChevronRight, CircleUserRound, Download, Globe, Palette, Target, Trash2, Upload } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card } from '$lib/components/ui/card/index.js';
	import { Dialog } from '$lib/components/ui/dialog/index.js';
	import { Toggle } from '$lib/components/ui/toggle/index.js';
	import { applyTheme, type ThemeMode } from '$lib/theme.svelte.js';
	import { store, type Lang } from '$lib/db.svelte.js';
	import { t } from '$lib/i18n.js';
	import { toasts } from '$lib/components/ui/toast/toast.svelte.js';
	import { cn } from '$lib/utils.js';

	const profile = $derived(store.data.profile);

	let nameOpen = $state(false);
	let resetOpen = $state(false);
	let themeOpen = $state(false);
	let langOpen = $state(false);
	let reminderOpen = $state(false);
	let goalOpen = $state(false);
	let aboutOpen = $state(false);
	let name = $state('');
	let remHour = $state(19);
	let remMin = $state(0);
	let fileInput: HTMLInputElement | null = null;

	const themeLabel = $derived(
		profile.theme === 'light' ? t('set.light') : profile.theme === 'dark' ? t('set.dark') : t('set.system')
	);
	const langLabel = $derived(profile.lang === 'hu' ? 'Magyar' : 'English');
	const reminderLabel = $derived(
		profile.reminder.enabled
			? `${String(profile.reminder.hour).padStart(2, '0')}:${String(profile.reminder.minute).padStart(2, '0')}`
			: t('set.reminderOff')
	);

	function openName() {
		name = profile.name;
		nameOpen = true;
	}

	function saveName() {
		store.setProfile({ name: name.trim() });
		toasts.show(t('set.saved'));
		nameOpen = false;
	}

	function setTheme(mode: ThemeMode) {
		store.setProfile({ theme: mode });
		applyTheme(mode);
		themeOpen = false;
	}

	function setLang(lang: Lang) {
		store.setProfile({ lang });
		try {
			document.documentElement.lang = lang;
		} catch {
			/* ssr */
		}
		langOpen = false;
	}

	function openReminder() {
		remHour = profile.reminder.hour;
		remMin = profile.reminder.minute;
		reminderOpen = true;
	}

	function saveReminder() {
		store.setProfile({ reminder: { ...profile.reminder, hour: remHour, minute: remMin } });
		reminderOpen = false;
	}

	function toggleReminder(v: boolean) {
		store.setProfile({ reminder: { ...profile.reminder, enabled: v } });
	}

	function setGoal(n: number) {
		store.setProfile({ dailyGoal: n });
		goalOpen = false;
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
				applyTheme(store.data.profile.theme);
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
		applyTheme(store.data.profile.theme);
		resetOpen = false;
		toasts.show(t('toast.deleted'));
	}

	const goals = [5, 10, 15, 20];
	const themes: { m: ThemeMode; label: string }[] = [
		{ m: 'system', label: t('set.system') },
		{ m: 'light', label: t('set.light') },
		{ m: 'dark', label: t('set.dark') }
	];
</script>

<svelte:head>
	<title>{t('set.title')} — Leardy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-5 px-1 pt-2">
	<!-- Fiók-kártya -->
	<button type="button" onclick={openName} class="press block w-full text-left">
		<Card class="card-lift flex-row items-center gap-3.5 px-4 py-4">
			<span
				class="grid size-[52px] shrink-0 place-items-center rounded-full"
				style="background: color-mix(in srgb, var(--primary) 14%, transparent)"
			>
				<CircleUserRound class="text-primary size-6" />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block truncate text-base font-semibold">{profile.name || t('set.guest')}</span>
				<span class="text-muted-foreground mt-0.5 block truncate text-sm">{t('set.guest.d')}</span>
			</span>
			<ChevronRight class="text-graphite size-5 shrink-0" />
		</Card>
	</button>

	<!-- Alkalmazás -->
	<div>
		<h2 class="mb-2 px-1 text-base font-semibold">{t('set.appGroup')}</h2>
		<Card class="py-1">
			<div class="flex flex-col px-2">
				<button type="button" onclick={() => (themeOpen = true)} class="hover:bg-accent press flex items-center gap-3 rounded-xl px-2 py-2 text-left">
					<Palette class="text-muted-foreground size-5 shrink-0" />
					<span class="flex-1">
						<span class="block text-[15px] font-semibold">{t('set.theme')}</span>
						<span class="text-muted-foreground block text-[13px]">{themeLabel}</span>
					</span>
					<ChevronRight class="text-graphite size-5" />
				</button>
				<button type="button" onclick={() => (langOpen = true)} class="hover:bg-accent press flex items-center gap-3 rounded-xl px-2 py-2 text-left">
					<Globe class="text-muted-foreground size-5 shrink-0" />
					<span class="flex-1">
						<span class="block text-[15px] font-semibold">{t('set.lang')}</span>
						<span class="text-muted-foreground block text-[13px]">{langLabel}</span>
					</span>
					<ChevronRight class="text-graphite size-5" />
				</button>
				<button type="button" onclick={openReminder} class="hover:bg-accent press flex items-center gap-3 rounded-xl px-2 py-2 text-left">
					<Bell class="text-muted-foreground size-5 shrink-0" />
					<span class="flex-1">
						<span class="block text-[15px] font-semibold">{t('set.reminders')}</span>
						<span class="text-muted-foreground block text-[13px]">{reminderLabel}</span>
					</span>
					<ChevronRight class="text-graphite size-5" />
				</button>
				<button type="button" onclick={() => (goalOpen = true)} class="hover:bg-accent press flex items-center gap-3 rounded-xl px-2 py-2 text-left">
					<Target class="text-muted-foreground size-5 shrink-0" />
					<span class="flex-1">
						<span class="block text-[15px] font-semibold">{t('set.goal')}</span>
						<span class="text-muted-foreground block text-[13px]">{profile.dailyGoal} {t('set.goal.d')}</span>
					</span>
					<ChevronRight class="text-graphite size-5" />
				</button>
			</div>
		</Card>
	</div>

	<!-- Fiók és adatok -->
	<div>
		<h2 class="mb-2 px-1 text-base font-semibold">{t('set.accountGroup')}</h2>
		<Card class="py-1">
			<div class="flex flex-col px-2">
				<button type="button" onclick={openName} class="hover:bg-accent press flex items-center gap-3 rounded-xl px-2 py-2 text-left">
					<CircleUserRound class="text-muted-foreground size-5 shrink-0" />
					<span class="flex-1">
						<span class="block text-[15px] font-semibold">{t('set.account')}</span>
						<span class="text-muted-foreground block text-[13px]">{profile.name || t('set.guest')}</span>
					</span>
					<ChevronRight class="text-graphite size-5" />
				</button>
				<button type="button" onclick={doExport} class="hover:bg-accent press flex items-center gap-3 rounded-xl px-2 py-2 text-left">
					<Download class="text-muted-foreground size-5 shrink-0" />
					<span class="flex-1">
						<span class="block text-[15px] font-semibold">{t('set.export')}</span>
						<span class="text-muted-foreground block text-[13px]">{t('set.export.d')}</span>
					</span>
					<ChevronRight class="text-graphite size-5" />
				</button>
				<button type="button" onclick={() => fileInput?.click()} class="hover:bg-accent press flex items-center gap-3 rounded-xl px-2 py-2 text-left">
					<Upload class="text-muted-foreground size-5 shrink-0" />
					<span class="flex-1">
						<span class="block text-[15px] font-semibold">{t('set.import')}</span>
						<span class="text-muted-foreground block text-[13px]">{t('set.import.d')}</span>
					</span>
					<ChevronRight class="text-graphite size-5" />
				</button>
				<input bind:this={fileInput} type="file" accept="application/json" class="hidden" onchange={doImport} />
				<button
					type="button"
					onclick={() => (resetOpen = true)}
					class="hover:bg-destructive/10 hover:text-destructive press flex items-center gap-3 rounded-xl px-2 py-2 text-left"
				>
					<Trash2 class="size-5 shrink-0" />
					<span class="flex-1">
						<span class="block text-[15px] font-semibold">{t('set.reset')}</span>
						<span class="block text-[13px] opacity-70">{t('set.reset.d')}</span>
					</span>
				</button>
			</div>
		</Card>
	</div>

	<!-- Névjegy -->
	<div>
		<h2 class="mb-2 px-1 text-base font-semibold">{t('set.aboutGroup')}</h2>
		<Card class="py-1">
			<button type="button" onclick={() => (aboutOpen = true)} class="hover:bg-accent press flex w-full items-center gap-3 rounded-xl px-4 py-2 text-left">
				<span class="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-xl text-base font-extrabold">L</span>
				<span class="flex-1">
					<span class="block text-[15px] font-semibold">Leardy</span>
					<span class="text-muted-foreground block text-[13px]">{t('set.aboutTagline')}</span>
				</span>
				<ChevronRight class="text-graphite size-5" />
			</button>
		</Card>
	</div>
</div>

<!-- Név -->
<Dialog bind:open={nameOpen} title={t('set.name')}>
	<div class="flex flex-col gap-3">
		<input class="field" bind:value={name} placeholder={t('set.namePh')} maxlength={30} />
		<Button onclick={saveName} disabled={!name.trim()} class="w-full">{t('set.login')}</Button>
	</div>
</Dialog>

<!-- Téma -->
<Dialog bind:open={themeOpen} title={t('set.theme')} description={t('set.theme.d')}>
	<div class="flex flex-col gap-2">
		{#each themes as th (th.m)}
			<button
				type="button"
				onclick={() => setTheme(th.m)}
				class="press flex items-center gap-3 rounded-[14px] border bg-card p-3.5 text-left"
			>
				<span class="flex-1 text-[15px] font-semibold">{th.label}</span>
				{#if profile.theme === th.m}<Check class="text-primary size-5" />{/if}
			</button>
		{/each}
	</div>
</Dialog>

<!-- Nyelv -->
<Dialog bind:open={langOpen} title={t('set.lang')} description={t('set.lang.d')}>
	<div class="flex flex-col gap-2">
		{#each [{ c: 'hu', l: 'Magyar' }, { c: 'en', l: 'English' }] as row (row.c)}
			<button
				type="button"
				onclick={() => setLang(row.c as 'hu' | 'en')}
				class="press flex items-center gap-3 rounded-[14px] border bg-card p-3.5 text-left"
			>
				<span class="flex-1 text-[15px] font-semibold">{row.l}</span>
				{#if profile.lang === row.c}<Check class="text-primary size-5" />{/if}
			</button>
		{/each}
	</div>
</Dialog>

<!-- Emlékeztető -->
<Dialog bind:open={reminderOpen} title={t('set.reminders')}>
	<div class="flex flex-col gap-4">
		<div class="flex items-center justify-between gap-3">
			<span class="text-[15px] font-semibold">
				{profile.reminder.enabled ? t('set.reminderOn') : t('set.reminderOff')}
			</span>
			<Toggle value={profile.reminder.enabled} onChanged={toggleReminder} label={t('set.reminders')} />
		</div>
		<div>
			<span class="field-label">{t('set.reminderTime')}</span>
			<div class="flex items-center gap-2">
				<select class="field" bind:value={remHour} aria-label="Óra">
					{#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
						<option value={h}>{String(h).padStart(2, '0')}</option>
					{/each}
				</select>
				<span class="text-xl font-bold">:</span>
				<select class="field" bind:value={remMin} aria-label="Perc">
					{#each [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as m (m)}
						<option value={m}>{String(m).padStart(2, '0')}</option>
					{/each}
				</select>
			</div>
		</div>
		<Button onclick={saveReminder} class="w-full">{t('common.save')}</Button>
	</div>
</Dialog>

<!-- Napi cél -->
<Dialog bind:open={goalOpen} title={t('set.goal')} description="{profile.dailyGoal} {t('set.goal.d')}">
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
</Dialog>

<!-- Névjegy -->
<Dialog bind:open={aboutOpen} title="Leardy">
	<div class="flex flex-col gap-3">
		<p class="text-base font-semibold">{t('set.aboutTagline')}</p>
		<p class="text-muted-foreground text-sm">{t('set.aboutBody')}</p>
		<p class="text-muted-foreground text-xs">v0.1.0 · offline-first</p>
	</div>
</Dialog>

<!-- Reset -->
<Dialog bind:open={resetOpen} title={t('set.reset.t')} description={t('set.reset.d')}>
	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={() => (resetOpen = false)}>{t('common.cancel')}</Button>
		<Button variant="destructive" class="flex-1" onclick={doReset}>{t('set.reset.yes')}</Button>
	{/snippet}
</Dialog>

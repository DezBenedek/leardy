<script lang="ts">
	import { getTutorial } from '$lib/tutorial/controller.svelte';
	import {
		Bell,
		BookOpen,
		ChevronRight,
		Compass,
		Database,
		Info,
		KeyRound,
		Palette,
		UserRound
	} from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import GoogleLoginButton from '$lib/components/GoogleLoginButton.svelte';
	import WhatsNew from '$lib/components/WhatsNew.svelte';
	import { auth } from '$lib/state/auth.svelte';
	import { loadSettings, saveSettings } from '$lib/state/settings';
	import { applyDisplaySettings } from '$lib/state/display';
	import { toast } from '$lib/state/toast.svelte';
	import { pushState, subscribePush, type PushState } from '$lib/platform/push-client';
	import { APP_VERSION } from '$lib/app/version';
	import { theme } from '$lib/state/theme.svelte';
	import type { PageData } from './$types';
	import SettingsAccount from './SettingsAccount.svelte';
	import SettingsNotif from './SettingsNotif.svelte';
	import SettingsTheme from './SettingsTheme.svelte';
	import SettingsLearning from './SettingsLearning.svelte';
	import SettingsStorage from './SettingsStorage.svelte';
	import SettingsAbout from './SettingsAbout.svelte';
	import SettingsDeveloper from './SettingsDeveloper.svelte';
	import SettingsNameEdit from './SettingsNameEdit.svelte';
	import {
		accountEditTitles,
		fmtBytes,
		fontFamilyLabel,
		sheetTitles,
		tile,
		type AccountEdit,
		type Sheet
	} from './settings-ui';
	import { ApiKeysStore } from './api-keys.svelte';
	import {
		clearAllCache as clearAllCacheStorage,
		clearOfflineLibrary as clearOfflineLibraryStorage,
		emptyStorageInfo,
		refreshStorageInfo as computeStorageInfo
	} from './storage-settings';

	const tutorial = getTutorial();
	let { data }: { data: PageData } = $props();

	// Az első megjelenítéskor a szerver adatai érvényesek, így nem villan fel hibás profil.
	let user = $derived(auth.ready ? auth.user : (data.user ?? null));
	let initial = $derived(user?.name.trim().charAt(0).toUpperCase() ?? '');
	let sheet = $state<Sheet>(null);
	let accountEdit = $state<AccountEdit>(null);
	let whatsNewOpen = $state(false);

	let nameDraft = $state('');
	let busyName = $state(false);

	$effect(() => {
		if (sheet === 'account' && user) {
			nameDraft = user.name;
		}
	});

	async function saveName(e: SubmitEvent) {
		e.preventDefault();
		if (busyName) return;
		busyName = true;
		const res = await auth.updateName(nameDraft);
		busyName = false;
		if (res.ok) {
			toast.success('Név frissítve');
			accountEdit = null;
		} else {
			toast.error('Nem sikerült menteni', res.error);
		}
	}

	function closeAccountEdit() {
		accountEdit = null;
	}

	let isTeacher = $derived(user?.role === 'teacher' || !!user?.is_admin);

	const api = new ApiKeysStore(() => isTeacher);

	let settings = $state(loadSettings());
	let pushSt = $state<PushState>('off');
	let pushBusy = $state(false);
	let deleteAccountOpen = $state(false);
	let deleteAccountBusy = $state(false);
	let exportBusy = $state(false);
	let storageInfo = $state(emptyStorageInfo());
	let storageBusy = $state(false);
	let wordLangs = $state<{ subjectId: string; subjectTitle: string }[]>([]);
	let wordLangsLoading = $state(false);
	let wordLangsLoaded = $state(false);

	async function loadWordLangs() {
		if (wordLangsLoading || wordLangsLoaded) return;
		wordLangsLoading = true;
		try {
			const res = await fetch("/api/sm2-due", { credentials: "same-origin" });
			if (res.ok) {
				const j = await res.json();
				wordLangs = (j.languages ?? []).map((l: { subjectId: string; subjectTitle: string }) => ({
					subjectId: l.subjectId,
					subjectTitle: l.subjectTitle
				}));
			}
		} catch {
			// néma hiba: csak a főkapcsoló látszik
		} finally {
			wordLangsLoading = false;
			wordLangsLoaded = true;
		}
	}

	function toggleWordSubject(subjectId: string, visible: boolean) {
		const hidden = new Set(settings.hiddenWordSubjects);
		if (visible) hidden.delete(subjectId);
		else hidden.add(subjectId);
		settings.hiddenWordSubjects = [...hidden];
	}

	function updateStorageInfo() {
		storageInfo = computeStorageInfo();
	}

	function unmuteClassroom(id: string) {
		settings.mutedClassrooms = settings.mutedClassrooms.filter((x) => x !== id);
	}

	function unmuteAll() {
		settings.mutedClassrooms = [];
	}

	async function handleClearOfflineLibrary() {
		if (storageBusy) return;
		storageBusy = true;
		try {
			clearOfflineLibraryStorage();
			updateStorageInfo();
			toast.success('Offline tárhely ürítve', 'Legközelebb hálózatból töltünk.');
		} catch {
			toast.error('Nem sikerült üríteni');
		} finally {
			storageBusy = false;
		}
	}

	async function handleClearAllCache() {
		if (storageBusy) return;
		storageBusy = true;
		try {
			clearAllCacheStorage();
			updateStorageInfo();
			toast.success('Gyorstár ürítve', 'A beállításaid megmaradtak.');
		} catch {
			toast.error('Nem sikerült üríteni');
		} finally {
			storageBusy = false;
		}
	}

	let classroomNames = $state<Record<string, string>>({});
	let mutedLoading = $state(false);

	function mutedName(id: string): string {
		return classroomNames[id] ?? 'Névtelen osztály';
	}

	async function loadMutedNames() {
		if (mutedLoading) return;
		if (settings.mutedClassrooms.length === 0) return;
		mutedLoading = true;
		try {
			const res = await fetch('/api/classrooms', { credentials: 'same-origin' });
			if (!res.ok) return;
			const j = (await res.json()) as {
				teaching?: { id: string; name: string }[];
				joined?: { id: string; name: string }[];
			};
			const map: Record<string, string> = {};
			for (const r of [...(j.teaching ?? []), ...(j.joined ?? [])]) {
				if (r?.id) map[r.id] = r.name || 'Névtelen osztály';
			}
			classroomNames = map;
		} catch {
			// név nélkül is feloldható
		} finally {
			mutedLoading = false;
		}
	}

	async function refreshPush() {
		pushSt = await pushState();
		pushKnown = true;
	}

	$effect(() => {
		if (sheet !== 'notif') return;
		void refreshPush();
		void loadMutedNames();
		const visible = () => { if (!document.hidden) void refreshPush(); };
		document.addEventListener('visibilitychange', visible);
		return () => document.removeEventListener('visibilitychange', visible);
	});

	async function enablePush() {
		if (pushBusy) return;
		pushBusy = true;
		try {
			const result = await subscribePush();
			await refreshPush();
			if (result.ok) toast.success('Push üzenetek aktiválva');
			else toast.error('Nem sikerült kapcsolódni', result.error);
		} finally {
			pushBusy = false;
		}
	}

	async function exportAccountData() {
		if (exportBusy) return;
		exportBusy = true;
		try {
			const data = await auth.exportData();
			if (!data) {
				toast.error('Nem sikerült letölteni');
				return;
			}
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = 'leardy-adataim.json';
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 5000);
			toast.success('Adatok letöltve');
		} finally {
			exportBusy = false;
		}
	}

	async function deleteAccount() {
		if (deleteAccountBusy) return;
		deleteAccountBusy = true;
		const res = await auth.deleteAccount();
		deleteAccountBusy = false;
		if (res.ok) {
			deleteAccountOpen = false;
			sheet = null;
			toast.success('Fiók törölve', 'Minden adatod törlődött.');
		} else {
			toast.error('Nem sikerült törölni', res.error);
		}
	}

	function onReminderTime(e: Event) {
		const v = (e.target as HTMLInputElement)?.value ?? '';
		if (/^([01]?\d|2[0-3]):([0-5]\d)$/.test(v)) {
			const [h, m] = v.split(':');
			settings.reminderTime = `${h.padStart(2, '0')}:${m}`;
			// A bezárás előtt is induljon el a szerveres időpont mentése.
			saveSettings($state.snapshot(settings));
		}
	}

	$effect(() => {
		// A megjelenés azonnal frissül, a mentés késleltetett.
		// Így a csúszka húzása közben nem írunk minden képkockánál a helyi tárba.
		const snapshot = $state.snapshot(settings);
		applyDisplaySettings(snapshot);
		const t = setTimeout(() => saveSettings(snapshot), 250);
		return () => clearTimeout(t);
	});

	$effect(() => {
		if (sheet === 'storage') updateStorageInfo();
	});

	$effect(() => {
		if (sheet === 'learning') void loadWordLangs();
	});

	$effect(() => {
		if (sheet === 'developer') void api.loadApiKeys();
	});

	let pushKnown = $state(false);
	let notifSummary = $derived(pushKnown && pushSt === 'on' ? 'Push üzenetek aktívak' : 'Push üzenetek és emlékeztetők');

	let themeLabel = $derived(
		theme.choice === 'light' ? 'Világos' : theme.choice === 'dark' ? 'Sötét' : 'Rendszer'
	);

	let displayLabel = $derived(
		`${fontFamilyLabel(settings.fontFamily)}${settings.reduceMotion ? ' · nyugodt' : ''}${settings.compactList ? ' · kompakt' : ''}`
	);
	let storageSummary = $derived(
		storageInfo.total > 0 ? `${fmtBytes(storageInfo.total)} helyben` : 'Offline és gyorstár'
	);
</script>

<svelte:head>
	<title>Beállítások | Leardy</title>
</svelte:head>

<h1 class="font-display -mt-2 text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">Beállítások</h1>

<!-- Fiók -->
<button
	onclick={() => (sheet = 'account')}
	class="mt-3 flex w-full items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
>
	{#if user}
		<span class="grid size-11 shrink-0 place-items-center rounded-full bg-brand-500 text-[17px] font-extrabold text-white">
			{initial}
		</span>
		<span class="min-w-0 flex-1">
			<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{user.name}</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{user.email}</span>
		</span>
	{:else}
		<span class={tile}>
			<UserRound size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Fiók</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">Jelentkezz be a tanteremhez</span>
		</span>
	{/if}
	<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
</button>

<!-- Opciók -->
<div class="mt-3 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-stone-900">
	<button
		onclick={() => (sheet = 'notif')}
		class="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:active:bg-white/10 dark:hover:bg-white/5"
	>
		<span class={tile}>
			<Bell size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Értesítések</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{notifSummary}</span>
		</span>
		<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
	</button>
	<button
		onclick={() => (sheet = 'theme')}
		class="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:active:bg-white/10 dark:hover:bg-white/5"
	>
		<span class={tile}>
			<Palette size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Megjelenés</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{themeLabel} · {displayLabel}</span>
		</span>
		<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
	</button>
	<button type="button" onclick={() => (sheet = 'learning')} class="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:active:bg-white/10 dark:hover:bg-white/5">
		<span class={tile}><BookOpen size={22} /></span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Tanulás</span>
			<span class="block text-[13px] text-stone-500 dark:text-stone-400">{settings.homeWords ? 'Szógyakorlás bekapcsolva' : 'Szógyakorlás kikapcsolva'}</span>
		</span>
		<ChevronRight size={18} class="shrink-0 text-stone-400" />
	</button>

	<button
		onclick={() => {
			updateStorageInfo();
			sheet = 'storage';
		}}
		class="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:active:bg-white/10 dark:hover:bg-white/5"
	>
		<span class={tile}>
			<Database size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Tárhely</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{storageSummary}</span>
		</span>
		<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
	</button>
	<button
		data-tutorial="tutorial-reopen"
		onclick={() => { if (tutorial) tutorial.menuOpen = true; }}
		class="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:active:bg-white/10 dark:hover:bg-white/5"
	>
		<span class={tile}><Compass size={22} /></span>
		<span class="min-w-0 flex-1"><span class="block text-[15px] font-bold text-ink-900 dark:text-white">Útmutató</span><span class="block text-[13px] text-ink-400 dark:text-stone-500">Első lépések és részletes bemutatók</span></span>
		<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
	</button>
	{#if isTeacher}
		<button
			onclick={() => (sheet = 'developer')}
			class="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:active:bg-white/10 dark:hover:bg-white/5"
		>
			<span class={tile}>
				<KeyRound size={22} />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Fejlesztői beállítások</span>
				<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">Publikus API kulcsok kezelése</span>
			</span>
			<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
		</button>
	{/if}
	<button
		onclick={() => (sheet = 'about')}
		class="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:active:bg-white/10 dark:hover:bg-white/5"
	>
		<span class={tile}>
			<Info size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Névjegy</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{APP_VERSION} verzió</span>
		</span>
		<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
	</button>
</div>

<!-- Drawer a kiválasztott opcióval -->
<Drawer open={sheet !== null} label={sheet ? sheetTitles[sheet] : ''} title={sheet ? sheetTitles[sheet] : ''} onClose={() => (sheet = null)}>
		{#if sheet === 'account'}
			<SettingsAccount
				{user}
				{initial}
				{exportBusy}
				onExport={exportAccountData}
				onDeleteRequest={() => { deleteAccountOpen = true; }}
				onLogout={() => { auth.logout(); sheet = null; }}
				onEditName={() => { nameDraft = user?.name ?? ''; accountEdit = 'name'; }}
			/>
		{:else if sheet === 'notif'}
			<SettingsNotif
				{settings}
				{pushSt}
				{pushKnown}
				{pushBusy}
				{mutedLoading}
				{classroomNames}
				onEnablePush={enablePush}
				onReminderTime={onReminderTime}
				onUnmuteClassroom={unmuteClassroom}
				onUnmuteAll={unmuteAll}
				{mutedName}
			/>
		{:else if sheet === 'theme'}
			<SettingsTheme {settings} />
		{:else if sheet === 'learning'}
			<SettingsLearning
				{settings}
				{user}
				{wordLangs}
				onToggleWordSubject={toggleWordSubject}
			/>
		{:else if sheet === 'storage'}
			<SettingsStorage
				{storageInfo}
				{storageBusy}
				onClearOffline={handleClearOfflineLibrary}
				onClearAll={handleClearAllCache}
			/>
		{:else if sheet === 'about'}
			<SettingsAbout onOpenWhatsNew={() => (whatsNewOpen = true)} />
		{:else if sheet === 'developer'}
			<SettingsDeveloper {isTeacher} {api} />
		{/if}
</Drawer>

<!-- Új drawer: név módosítása -->
<Drawer
	open={accountEdit !== null}
	label={accountEdit ? accountEditTitles[accountEdit] : ''}
	title={accountEdit ? accountEditTitles[accountEdit] : ''}
	onClose={closeAccountEdit}
>
	{#if accountEdit === 'name'}
		<SettingsNameEdit bind:nameDraft {busyName} onSubmit={saveName} />
	{/if}
</Drawer>

<WhatsNew open={whatsNewOpen} onClose={() => (whatsNewOpen = false)} />

<ConfirmDialog
	open={deleteAccountOpen}
	title="Fiók törlése"
	description="Minden adatod végleg törlődik. A saját osztályaidat előbb töröld."
	confirmLabel="Törlöm a fiókom"
	busy={deleteAccountBusy}
	onClose={() => {
		if (!deleteAccountBusy) deleteAccountOpen = false;
	}}
	onConfirm={deleteAccount}
/>

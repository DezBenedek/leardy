<script lang="ts">
	import { getTutorial } from '$lib/tutorial/controller.svelte';
	import {
		Bell,
		BookOpen,
		Check,
		ChevronRight,
		Compass,
		Copy,
		Database,
		HardDrive,
		Info,
		KeyRound,
		LogOut,
		MessageCircle,
		Moon,
		Palette,
		Pencil,
		Smartphone,
		Sparkles,
		Sun,
		Trash2,
		UserRound
	} from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import FontFamilyPicker from '$lib/components/FontFamilyPicker.svelte';
	import GoogleLoginButton from '$lib/components/GoogleLoginButton.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import WhatsNew from '$lib/components/WhatsNew.svelte';
	import { auth } from '$lib/auth.svelte';
	import { loadSettings, saveSettings } from '$lib/settings';
	import { applyDisplaySettings } from '$lib/display';
	import { toast } from '$lib/toast.svelte';
	import { pushState, subscribePush, type PushState } from '$lib/push-client';
	import { LATEST_CHANGE } from '$lib/changelog';
	import { APP_VERSION, appBuildLabel } from '$lib/version';
	import { theme, type ThemeChoice } from '$lib/theme.svelte';
	import type { PageData } from './$types';

	const tutorial = getTutorial();
	let { data }: { data: PageData } = $props();

	type Sheet = null | 'account' | 'notif' | 'theme' | 'learning' | 'storage' | 'about' | 'developer';
	type AccountEdit = null | 'name';

	interface ApiKeyItem {
		id: string;
		name: string;
		prefix: string;
		createdAt: number;
		lastUsedAt: number | null;
		revoked: boolean;
	}

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

	const accountEditTitles: Record<Exclude<AccountEdit, null>, string> = {
		name: 'Név módosítása'
	};

	const inputCls =
		'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:ring-brand-500/20';

	const primaryCls =
		'inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-500 px-5 py-2.5 text-[15px] font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-60 dark:shadow-black/30';

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

	const sheetTitles: Record<Exclude<Sheet, null>, string> = {
		account: 'Fiók',
		notif: 'Értesítések',
		theme: 'Megjelenés',
		learning: 'Tanulás',
		storage: 'Tárhely',
		about: 'Névjegy',
		developer: 'Fejlesztői beállítások'
	};

	let isTeacher = $derived(user?.role === 'teacher' || !!user?.is_admin);

	let apiKeys = $state<ApiKeyItem[]>([]);
	let apiKeysLoading = $state(false);
	let apiKeysLoaded = $state(false);
	let apiKeyName = $state('');
	let apiKeyBusy = $state(false);
	let apiNewSecret = $state<string | null>(null);
	let apiRevokeBusy = $state<string | null>(null);

	async function loadApiKeys(force = false) {
		if (!isTeacher) return;
		if (apiKeysLoading || (apiKeysLoaded && !force)) return;
		apiKeysLoading = true;
		try {
			const res = await fetch('/api/api-keys', { credentials: 'same-origin' });
			if (res.ok) {
				const j = await res.json();
				apiKeys = Array.isArray(j.keys) ? j.keys : [];
				apiKeysLoaded = true;
			}
		} catch {
			// néma hiba: a sor üres marad
		} finally {
			apiKeysLoading = false;
		}
	}

	async function createApiKey(e?: SubmitEvent) {
		e?.preventDefault();
		if (apiKeyBusy || !isTeacher) return;
		apiKeyBusy = true;
		try {
			const res = await fetch('/api/api-keys', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ name: apiKeyName.trim() || 'API kulcs' })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült létrehozni', j.error ?? 'Próbáld újra.');
				return;
			}
			apiNewSecret = j.secret ?? null;
			apiKeyName = '';
			apiKeysLoaded = false;
			await loadApiKeys(true);
			toast.success('API kulcs létrehozva', 'Másold ki most, később nem látszik.');
		} catch {
			toast.error('Nem sikerült létrehozni');
		} finally {
			apiKeyBusy = false;
		}
	}

	async function revokeApiKey(id: string) {
		if (apiRevokeBusy) return;
		apiRevokeBusy = id;
		try {
			const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE', credentials: 'same-origin' });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült visszavonni', j.error ?? 'Próbáld újra.');
				return;
			}
			apiKeys = apiKeys.filter((k) => k.id !== id);
			toast.success('Kulcs visszavonva');
		} catch {
			toast.error('Nem sikerült visszavonni');
		} finally {
			apiRevokeBusy = null;
		}
	}

	async function copySecret() {
		if (!apiNewSecret) return;
		try {
			await navigator.clipboard.writeText(apiNewSecret);
			toast.success('Kimásolva');
		} catch {
			toast.error('Másold ki kézzel a fenti mezőből.');
		}
	}

	function formatKeyDate(ts: number | null): string {
		if (!ts) return 'még nem használt';
		try {
			return new Date(ts).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' });
		} catch {
			return 'ismeretlen';
		}
	}

	let settings = $state(loadSettings());
	let pushSt = $state<PushState>('off');
	let pushBusy = $state(false);
	let deleteAccountOpen = $state(false);
	let deleteAccountBusy = $state(false);
	let exportBusy = $state(false);
	let storageInfo = $state({ lib: 0, scope: 0, seen: 0, total: 0 });
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

	function byteSize(v: string | null): number {
		if (!v) return 0;
		try {
			return new Blob([v]).size;
		} catch {
			return v.length;
		}
	}

	function fmtBytes(n: number): string {
		if (!Number.isFinite(n) || n <= 0) return '0 B';
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / 1024 / 1024).toFixed(2)} MB`;
	}

	function refreshStorageInfo() {
		if (typeof localStorage === 'undefined') return;
		try {
			let seen = 0;
			for (let i = 0; i < localStorage.length; i++) {
				const k = localStorage.key(i) ?? '';
				if (k.startsWith('leardy-seen-') || k.startsWith('leardy-reminder-') || k.startsWith('leardy-notif-')) {
					seen += byteSize(localStorage.getItem(k));
				}
			}
			const lib = byteSize(localStorage.getItem('leardy-library'));
			const scope = byteSize(localStorage.getItem('leardy-scope'));
			storageInfo = { lib, scope, seen, total: lib + scope + seen };
		} catch {
			// tiltott storage
		}
	}

	function unmuteClassroom(id: string) {
		settings.mutedClassrooms = settings.mutedClassrooms.filter((x) => x !== id);
	}

	function unmuteAll() {
		settings.mutedClassrooms = [];
	}

	async function clearOfflineLibrary() {
		if (storageBusy) return;
		storageBusy = true;
		try {
			localStorage.removeItem('leardy-library');
			refreshStorageInfo();
			toast.success('Offline tárhely ürítve', 'Legközelebb hálózatból töltünk.');
		} catch {
			toast.error('Nem sikerült üríteni');
		} finally {
			storageBusy = false;
		}
	}

	async function clearAllCache() {
		if (storageBusy) return;
		storageBusy = true;
		try {
			const keepSettings = localStorage.getItem('leardy-settings');
			const keepTheme = localStorage.getItem('leardy-theme');
			const keepWhats = localStorage.getItem('leardy-whatsnew-seen');
			const keys: string[] = [];
			for (let i = 0; i < localStorage.length; i++) {
				const k = localStorage.key(i);
				if (k && k.startsWith('leardy-')) keys.push(k);
			}
			for (const k of keys) {
				if (k === 'leardy-settings' || k === 'leardy-theme' || k === 'leardy-whatsnew-seen') continue;
				localStorage.removeItem(k);
			}
			if (keepSettings !== null) localStorage.setItem('leardy-settings', keepSettings);
			if (keepTheme !== null) localStorage.setItem('leardy-theme', keepTheme);
			if (keepWhats !== null) localStorage.setItem('leardy-whatsnew-seen', keepWhats);
			refreshStorageInfo();
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
		if (sheet === 'storage') refreshStorageInfo();
	});

	$effect(() => {
		if (sheet === 'learning') void loadWordLangs();
	});

	$effect(() => {
		if (sheet === 'developer') void loadApiKeys();
	});

	let pushKnown = $state(false);
	let notifSummary = $derived(pushKnown && pushSt === 'on' ? 'Push üzenetek aktívak' : 'Push üzenetek és emlékeztetők');

	let themeLabel = $derived(
		theme.choice === 'light' ? 'Világos' : theme.choice === 'dark' ? 'Sötét' : 'Rendszer'
	);
	function fontFamilyLabel(f: string): string {
		return f === 'modern' ? 'Modern' : f === 'book' ? 'Könyvszerű' : f === 'excalifont' ? 'Excalifont' : 'Rendszer';
	}

	let displayLabel = $derived(
		`${fontFamilyLabel(settings.fontFamily)}${settings.reduceMotion ? ' · nyugodt' : ''}${settings.compactList ? ' · kompakt' : ''}`
	);
	let storageSummary = $derived(
		storageInfo.total > 0 ? `${fmtBytes(storageInfo.total)} helyben` : 'Offline és gyorstár'
	);

	const themeOptions: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
		{ id: 'light', label: 'Világos', icon: Sun },
		{ id: 'dark', label: 'Sötét', icon: Moon },
		{ id: 'system', label: 'Rendszer', icon: Smartphone }
	];

	const tile =
		'grid size-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-white';
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
			refreshStorageInfo();
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
			<div class="mt-3">
				{#if user}
					<div class="flex items-center gap-3.5">
						<span class="grid size-12 shrink-0 place-items-center rounded-full bg-brand-500 text-lg font-extrabold text-white">
							{initial}
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-[16px] font-bold text-ink-900 dark:text-white">{user.name}</p>
							<p class="truncate text-[13px] text-ink-400 dark:text-stone-500">{user.email}</p>
						</div>
					</div>
					<div class="mt-4 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 dark:divide-white/5 dark:border-white/10">
						<button
							type="button"
							onclick={() => {
								nameDraft = user?.name ?? '';
								accountEdit = 'name';
							}}
							class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-white/5 dark:active:bg-white/10"
						>
							<Pencil size={18} class="shrink-0 text-stone-400 dark:text-stone-500" />
							<span class="min-w-0 flex-1">
								<span class="block text-[15px] font-semibold text-ink-900 dark:text-white">Név módosítása</span>
							</span>
							<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
						</button>
					</div>
					<button
						onclick={exportAccountData}
						disabled={exportBusy}
						class="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-ink-900 transition hover:bg-stone-50 active:scale-[0.99] disabled:opacity-60 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
					>
						<Database size={17} />
						{exportBusy ? 'Készül…' : 'Adataim letöltése'}
					</button>
					<button
						onclick={() => {
							deleteAccountOpen = true;
						}}
						class="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-red-600 transition hover:bg-red-50 active:scale-[0.99] dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
					>
						<Trash2 size={17} />
						Fiók törlése
					</button>
					<button
						onclick={() => {
							auth.logout();
							sheet = null;
						}}
						class="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-red-600 transition hover:bg-red-50 active:scale-[0.99] dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
					>
						<LogOut size={17} />
						Kijelentkezés
					</button>
				{:else}
					<p class="text-sm leading-relaxed text-stone-500 dark:text-stone-400">
						A mentéshez jelentkezz be.
					</p>
					<div class="mt-4">
						<GoogleLoginButton />
					</div>
				{/if}
			</div>
		{:else if sheet === 'notif'}
			<div class="mt-1">
				<div class="flex min-h-14 items-center gap-3 py-2" aria-live="polite">
					<Bell size={21} class="shrink-0 text-stone-400" aria-hidden="true" />
					<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Push üzenetek</p>
					{#if pushKnown && pushSt === 'on'}
						<span role="img" aria-label="Push üzenetek aktívak" class="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
							<Check size={23} strokeWidth={3} aria-hidden="true" />
						</span>
					{:else}
						<button type="button" onclick={enablePush} disabled={!pushKnown || pushBusy}
							class="min-h-11 shrink-0 rounded-full bg-brand-500 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60">
							{pushBusy ? 'Aktiválás…' : !pushKnown ? 'Ellenőrzés…' : 'Aktiválás'}
						</button>
					{/if}
				</div>

				<p class="mt-5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Tantermi értesítések</p>
				<ul class="divide-y divide-stone-100 dark:divide-white/5">
					<li class="flex items-center gap-3 py-3">
						<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Tantermi üzenetek</p>
						<Toggle bind:checked={settings.pushClassMessage} label="Tantermi üzenetek" />
					</li>
					<li class="flex items-center gap-3 py-3">
						<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Feladatok és beadandók</p>
						<Toggle bind:checked={settings.pushClassTask} label="Feladatok és beadandók" />
					</li>
					<li class="flex items-center gap-3 py-3">
						<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Jegyek és visszajelzések</p>
						<Toggle bind:checked={settings.pushGrades} label="Jegyek és visszajelzések" />
					</li>
				</ul>

				<p class="mt-5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Emlékeztetők</p>
				<ul class="divide-y divide-stone-100 dark:divide-white/5">
					<li class="py-3">
						<div class="flex items-center gap-3">
							<div class="min-w-0 flex-1">
								<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Napi emlékeztető</p>
							</div>
							<Toggle bind:checked={settings.reminder} label="Napi emlékeztető" />
						</div>
						{#if settings.reminder}
							<label class="mt-3 flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2 dark:bg-white/5">
								<span class="text-[13px] font-medium text-stone-500 dark:text-stone-400">Időpont</span>
								<input type="time" value={settings.reminderTime} onchange={onReminderTime} aria-label="Napi időpont"
									class="min-h-11 w-[118px] rounded-lg border border-stone-200 bg-white px-3 py-2 text-center text-[15px] font-semibold text-ink-900 tabular-nums outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white" />
							</label>
						{/if}
					</li>
					<li class="flex items-center gap-3 py-3">
						<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Határidőfigyelő</p>
						<Toggle bind:checked={settings.dueSoon} label="Határidőfigyelő" />
					</li>
					<li class="flex items-center gap-3 py-3">
						<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Újdonságok</p>
						<Toggle bind:checked={settings.pushFeatures} label="Újdonságok" />
					</li>
				</ul>

				{#if settings.mutedClassrooms.length > 0}
					<p class="mt-5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Némított osztályok</p>
					<div class="mt-2 flex items-center justify-end">
						<button
							type="button"
							onclick={unmuteAll}
							class="shrink-0 rounded-full border border-stone-200 px-3.5 py-2 text-[13px] font-bold text-ink-600 dark:border-white/15 dark:text-stone-300"
						>
							Mind feloldom
						</button>
					</div>
					<ul class="mt-2 grid gap-1.5">
						{#each settings.mutedClassrooms as id (id)}
							<li class="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/5">
								<span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-stone-600 dark:text-stone-300">
									{mutedLoading && !classroomNames[id] ? 'Betöltés…' : mutedName(id)}
								</span>
								<button
									type="button"
									onclick={() => unmuteClassroom(id)}
									class="shrink-0 text-[13px] font-bold text-brand-600 dark:text-brand-400"
								>
									Feloldom
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else if sheet === 'theme'}
			<p class="mt-3 text-[13px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Téma</p>
			<div
				role="radiogroup"
				aria-label="Téma"
				class="mt-2 grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-white/10"
			>
				{#each themeOptions as opt (opt.id)}
					{@const Icon = opt.icon}
					{@const selected = theme.choice === opt.id}
					<button
						type="button"
						role="radio"
						aria-checked={selected}
						onclick={() => theme.set(opt.id)}
						class={[
							'flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 transition active:scale-[0.97]',
							selected
								? 'bg-white text-ink-900 shadow-sm dark:bg-stone-800 dark:text-white dark:shadow-black/40'
								: 'text-stone-500 hover:text-ink-900 dark:text-stone-400 dark:hover:text-white'
						]}
					>
						<Icon size={20} />
						<span class={['text-[13px] leading-none', selected ? 'font-extrabold' : 'font-semibold']}>
							{opt.label}
						</span>
					</button>
				{/each}
			</div>
			<div class="mt-3">
				<FontFamilyPicker bind:value={settings.fontFamily} label="Betűtípus" />
			</div>
			<ul class="mt-3 divide-y divide-stone-100 dark:divide-white/5">
				<li class="flex items-center gap-3 py-3">
					<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Mozgás csökkentése</p>
					<Toggle bind:checked={settings.reduceMotion} label="Mozgás csökkentése" />
				</li>
				<li class="flex items-center gap-3 py-3">
					<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Kompakt lista</p>
					<Toggle bind:checked={settings.compactList} label="Kompakt lista" />
				</li>
			</ul>
		{:else if sheet === 'learning'}
			<div class="mt-3 divide-y divide-stone-100 dark:divide-white/5">
				<div class="flex items-center gap-3 py-3">
					<div class="min-w-0 flex-1">
						<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Szógyakorlás a főoldalon</p>
					</div>
					<Toggle bind:checked={settings.homeWords} label="Szógyakorlás a főoldalon" />
				</div>
				<div
					class="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
					style="grid-template-rows: {settings.homeWords && wordLangs.length > 0 ? '1fr' : '0fr'}"
				>
					<div class="min-h-0 overflow-hidden">
						{#if wordLangs.length > 0}
							<div class="py-3">
								<div class="ml-1 border-l-2 border-brand-500/60 pl-3 dark:border-brand-400/60">
									<p class="text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">A szógyakorlás nyelvei</p>
									<ul class="mt-1 divide-y divide-stone-100 dark:divide-white/5">
										{#each wordLangs as lang (lang.subjectId)}
											<li class="flex items-center gap-3 py-2.5">
												<p class="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-900 dark:text-white">{lang.subjectTitle}</p>
												<Toggle
													checked={!settings.hiddenWordSubjects.includes(lang.subjectId)}
													onchange={(v) => toggleWordSubject(lang.subjectId, v)}
													label={lang.subjectTitle}
												/>
											</li>
										{/each}
									</ul>
								</div>
							</div>
						{/if}
					</div>
				</div>
				<div class="flex items-center gap-3 py-3">
					<div class="min-w-0 flex-1">
						<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Bekezdések nyitva</p>
					</div>
					<Toggle bind:checked={settings.openAllLessonSections} label="Bekezdések nyitva" />
				</div>
				{#if user?.role === 'teacher' || user?.is_admin}
					<div class="flex items-center gap-3 py-3">
						<div class="min-w-0 flex-1">
							<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Teljes szöveg a szerkesztőben</p>
						</div>
						<Toggle bind:checked={settings.expandEditorTextareas} label="Teljes szöveg a szerkesztőben" />
					</div>
				{/if}
			</div>
		{:else if sheet === 'storage'}
			<div class="mt-3">
				<div class="rounded-2xl border border-stone-200 p-4 dark:border-white/10">
					<p class="flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
						<HardDrive size={13} /> Helyi adatok
					</p>
					<p class="mt-1 text-[20px] font-extrabold text-ink-900 tabular-nums dark:text-white">
						{fmtBytes(storageInfo.total)}
					</p>
					<ul class="mt-2 grid gap-1 text-[13px] text-stone-500 dark:text-stone-400">
						<li class="flex items-center justify-between gap-2">
							<span>Offline kártyakönyvtár</span>
							<span class="font-bold text-ink-900 tabular-nums dark:text-white">{fmtBytes(storageInfo.lib)}</span>
						</li>
						<li class="flex items-center justify-between gap-2">
							<span>Oldalszűrők</span>
							<span class="font-bold text-ink-900 tabular-nums dark:text-white">{fmtBytes(storageInfo.scope)}</span>
						</li>
						<li class="flex items-center justify-between gap-2">
							<span>Értesítési jelzők</span>
							<span class="font-bold text-ink-900 tabular-nums dark:text-white">{fmtBytes(storageInfo.seen)}</span>
						</li>
					</ul>
					<p class="mt-2 text-[12px] leading-relaxed text-stone-400 dark:text-stone-500">
						A beállításaid megmaradnak.
					</p>
				</div>
				<div class="mt-2.5 grid gap-2">
					<button
						type="button"
						onclick={clearOfflineLibrary}
						disabled={storageBusy || storageInfo.lib === 0}
						class="flex w-full items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-[15px] font-bold text-ink-900 transition hover:bg-stone-50 active:scale-[0.99] disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
					>
						{storageBusy ? 'Ürítés…' : 'Offline tárhely ürítése'}
					</button>
					<button
						type="button"
						onclick={clearAllCache}
						disabled={storageBusy || storageInfo.total === 0}
						class="flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-[15px] font-bold text-red-600 transition hover:bg-red-50 active:scale-[0.99] disabled:opacity-50 dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
					>
						{storageBusy ? 'Ürítés…' : 'Összes gyorstár ürítése'}
					</button>
				</div>
			</div>
		{:else if sheet === 'about'}
			<div class="mt-3">
				<div class="flex items-center justify-between py-2.5">
					<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Verzió</p>
					<p class="text-sm text-ink-400 tabular-nums dark:text-stone-500">{APP_VERSION}</p>
				</div>
				<div class="flex items-center justify-between py-2.5">
					<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Utolsó frissítés</p>
					<p class="text-sm text-ink-400 tabular-nums dark:text-stone-500">{appBuildLabel()}</p>
				</div>
				<button
					type="button"
					onclick={() => (whatsNewOpen = true)}
					class="mt-1 flex w-full items-center gap-3 rounded-2xl bg-brand-50 p-4 text-left transition hover:bg-brand-100 active:scale-[0.99] dark:bg-brand-500/15 dark:hover:bg-brand-500/25"
				>
					<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-white">
						<Sparkles size={22} />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Újdonságok</span>
						<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">
							Frissítés - {LATEST_CHANGE.version}: {LATEST_CHANGE.title.toLowerCase()}
						</span>
					</span>
					<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
				</button>
				<a
					href="mailto:hello@leardy.app?subject=Leardy%20visszajelz%C3%A9s%20({APP_VERSION})"
					class="mt-2.5 flex w-full items-center gap-3 rounded-2xl border border-stone-200 p-4 text-left transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:hover:bg-white/5"
				>
					<span class={tile}>
						<MessageCircle size={22} />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Visszajelzés küldése</span>
						<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">Hiba vagy ötlet? Írj nekünk emailt.</span>
					</span>
					<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
				</a>
				<div class="mt-2.5 rounded-xl bg-stone-100 p-3.5 dark:bg-white/5">
					<p class="text-[13px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Fejlesztők</p>
					<p class="mt-1.5 text-[15px] font-semibold text-ink-900 dark:text-white">
						<a
							href="https://dezso.hu"
							target="_blank"
							rel="noopener noreferrer"
							class="text-brand-600 underline decoration-brand-300 underline-offset-2 dark:text-brand-400"
						>
							Dezső Benedek Péter
						</a>
						<span class="font-normal text-ink-600 dark:text-stone-400"> és</span>
						<a
							href="https://www.facebook.com/bercel.fidrich.5"
							target="_blank"
							rel="noopener noreferrer"
							class="text-brand-600 underline decoration-brand-300 underline-offset-2 dark:text-brand-400"
						>
							Fidrich Bercel
						</a>
					</p>
				</div>
				<p class="mt-2.5 rounded-xl bg-stone-100 p-3.5 text-[13px] leading-relaxed text-ink-600 dark:bg-white/5 dark:text-stone-400">
					A Ferences Ösztöndíj Programra készült a 2026/27-es tanévben.
				</p>
			</div>
		{:else if sheet === 'developer'}
			<div class="mt-3">
				{#if !isTeacher}
					<p class="text-sm leading-relaxed text-stone-500 dark:text-stone-400">
						A fejlesztői beállításokhoz tanári fiók kell.
					</p>
				{:else}
					<p class="text-[13px] leading-relaxed text-stone-500 dark:text-stone-400">
						A publikus API-val a tanulás és a kártyák szinte mindene elérhető: tantárgyak, leckék, kvízek, hivatalos és saját kártyák, haladás és gyakorlás. A kulcs a te nevedben jár el.
					</p>
					{#if apiNewSecret}
						<div class="mt-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
							<p class="text-[13px] font-bold text-emerald-700 dark:text-emerald-300">Új kulcs elkészült, másold ki most</p>
							<p class="mt-1 rounded-xl bg-white px-3 py-2 font-mono text-[13px] break-all text-ink-900 dark:bg-black/30 dark:text-white">{apiNewSecret}</p>
							<div class="mt-2 flex gap-2">
								<button type="button" onclick={copySecret} class="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-emerald-700">
									<Copy size={15} /> Másolás
								</button>
								<button type="button" onclick={() => (apiNewSecret = null)} class="rounded-full border border-emerald-300 px-4 py-2 text-[13px] font-bold text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300">
									Elrejtés
								</button>
							</div>
							<p class="mt-2 text-[12px] leading-relaxed text-emerald-700/80 dark:text-emerald-300/80">Később nem jelenik meg újra. Teszt: curl -H "Authorization: Bearer TOKEN" /api/v1/me</p>
						</div>
					{/if}
					<form onsubmit={createApiKey} class="mt-3 flex gap-2">
						<input
							type="text"
							placeholder="Kulcs neve, pl. Saját script"
							bind:value={apiKeyName}
							maxlength={60}
							disabled={apiKeyBusy}
							aria-label="Kulcs neve"
							class={inputCls}
						/>
						<button type="submit" disabled={apiKeyBusy} class="shrink-0 rounded-full bg-brand-500 px-5 py-2.5 text-[14px] font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 disabled:opacity-60">
							{apiKeyBusy ? 'Készül…' : 'Új kulcs'}
						</button>
					</form>
					<div class="mt-4">
						<div class="flex items-center justify-between">
							<p class="text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Aktív kulcsok</p>
							<button type="button" onclick={() => loadApiKeys(true)} disabled={apiKeysLoading} class="text-[13px] font-bold text-brand-600 dark:text-brand-400 disabled:opacity-50">
								{apiKeysLoading ? 'Frissítés…' : 'Frissítés'}
							</button>
						</div>
						{#if apiKeysLoading && !apiKeysLoaded}
							<p class="mt-2 text-sm text-stone-500">Betöltés…</p>
						{:else if apiKeys.length === 0}
							<p class="mt-2 rounded-xl bg-stone-100 p-3.5 text-[13px] leading-relaxed text-stone-500 dark:bg-white/5 dark:text-stone-400">
								Még nincs kulcsod. Hozz létre egyet a fenti mezővel, legfeljebb 10 aktív kulcsod lehet.
							</p>
						{:else}
							<ul class="mt-2 grid gap-2">
								{#each apiKeys as k (k.id)}
									<li class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
										<div class="flex items-center gap-2">
											<p class="min-w-0 flex-1 truncate text-[15px] font-bold text-ink-900 dark:text-white">{k.name}</p>
											<button
												type="button"
												onclick={() => revokeApiKey(k.id)}
												disabled={apiRevokeBusy === k.id}
												class="shrink-0 rounded-full border border-red-200 px-3 py-1.5 text-[12px] font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
											>
												{apiRevokeBusy === k.id ? 'Visszavonás…' : 'Visszavonás'}
											</button>
										</div>
										<p class="mt-0.5 font-mono text-[12px] text-stone-400 dark:text-stone-500">{k.prefix} · létrehozva {formatKeyDate(k.createdAt)}</p>
										<p class="text-[12px] text-stone-400 dark:text-stone-500">Utolsó használat: {formatKeyDate(k.lastUsedAt)}</p>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
					<div class="mt-3 rounded-xl bg-stone-100 p-3.5 text-[13px] leading-relaxed text-ink-600 dark:bg-white/5 dark:text-stone-400">
						Dokumentáció: <span class="font-mono font-semibold">docs/public-api.md</span> és <span class="font-mono font-semibold">GET /api/v1/</span>. Példa: <span class="font-mono">Authorization: Bearer ld_...</span>
					</div>
				{/if}
			</div>
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
		<form onsubmit={saveName} class="mt-3 space-y-3.5" novalidate>
			<div>
				<label for="account-name" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">Név</label>
				<input
					id="account-name"
					type="text"
					autocomplete="name"
					placeholder="Add meg a neved"
					bind:value={nameDraft}
					disabled={busyName}
					class={inputCls}
				/>
			</div>
			<button type="submit" disabled={busyName} class={primaryCls}>
				{busyName ? 'Mentés…' : 'Név mentése'}
			</button>
		</form>
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

<script lang="ts">
	import {
		Bell,
		BellOff,
		ChevronRight,
		Database,
		Eye,
		EyeOff,
		HardDrive,
		Info,
		KeyRound,
		Layers,
		LogOut,
		Mail,
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
	import Toggle from '$lib/components/Toggle.svelte';
	import WhatsNew from '$lib/components/WhatsNew.svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import { loadSettings, saveSettings } from '$lib/settings';
	import { applyDisplaySettings } from '$lib/display';
	import {
		canNotify,
		getNotifPermission,
		type NotifPermission
	} from '$lib/notifications';
	import { toast } from '$lib/toast.svelte';
	import { pushState, subscribePush, unsubscribePush, type PushState } from '$lib/push-client';
	import { LATEST_CHANGE } from '$lib/changelog';
	import { APP_VERSION, appBuildLabel } from '$lib/version';
	import { theme, type ThemeChoice } from '$lib/theme.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Sheet = null | 'account' | 'notif' | 'theme' | 'cards' | 'storage' | 'about';
	type AccountEdit = null | 'name' | 'email' | 'password';

	// Szerveradat a forras az elso paintkor, igy nincs profil-villanas.
	let user = $derived(auth.ready ? auth.user : (data.user ?? null));
	let initial = $derived(user?.name.trim().charAt(0).toUpperCase() ?? '');
	let sheet = $state<Sheet>(null);
	let accountEdit = $state<AccountEdit>(null);
	let whatsNewOpen = $state(false);

	let nameDraft = $state('');
	let emailDraft = $state('');
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let showCurrent = $state(false);
	let showNew = $state(false);
	let busyName = $state(false);
	let busyEmail = $state(false);
	let busyPass = $state(false);

	$effect(() => {
		if (sheet === 'account' && user) {
			nameDraft = user.name;
			emailDraft = user.email;
		}
	});

	const accountEditTitles: Record<Exclude<AccountEdit, null>, string> = {
		name: 'Név módosítása',
		email: 'E-mail cím módosítása',
		password: 'Jelszó módosítása'
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
			toast.success('Név frissítve', 'Sikeresen módosítottad a neved.');
			accountEdit = null;
		} else {
			toast.error('Nem sikerült menteni', res.error);
		}
	}

	async function saveEmail(e: SubmitEvent) {
		e.preventDefault();
		if (busyEmail) return;
		busyEmail = true;
		const res = await auth.updateEmail(emailDraft);
		busyEmail = false;
		if (res.ok) {
			toast.success('E-mail cím frissítve', 'Sikeresen módosítottad az e-mail címed.');
			accountEdit = null;
		} else {
			toast.error('Nem sikerült menteni', res.error);
		}
	}

	async function savePassword(e: SubmitEvent) {
		e.preventDefault();
		if (busyPass) return;
		if (newPassword !== confirmPassword) {
			toast.error('Nem egyezik', 'Az új jelszó és a megerősítés tér el.');
			return;
		}
		busyPass = true;
		const res = await auth.changePassword(currentPassword, newPassword);
		busyPass = false;
		if (res.ok) {
			toast.success('Jelszó frissítve', 'A többi eszközön kiléptettünk.');
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
			accountEdit = null;
		} else {
			toast.error('Nem sikerült menteni', res.error);
		}
	}

	function closeAccountEdit() {
		accountEdit = null;
		currentPassword = '';
		newPassword = '';
		confirmPassword = '';
		showCurrent = false;
		showNew = false;
	}

	const sheetTitles: Record<Exclude<Sheet, null>, string> = {
		account: 'Fiók',
		notif: 'Értesítések',
		theme: 'Megjelenés',
		cards: 'Gyakorlás',
		storage: 'Tárhely',
		about: 'Névjegy'
	};

	let settings = $state(loadSettings());
	let notifPerm = $state<NotifPermission>('default');
	let pushSt = $state<PushState>('off');
	let pushBusy = $state(false);
	let deleteAccountOpen = $state(false);
	let deleteAccountBusy = $state(false);
	let exportBusy = $state(false);
	let storageInfo = $state({ lib: 0, scope: 0, seen: 0, total: 0 });
	let storageBusy = $state(false);

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

	function refreshNotifPerm() {
		try {
			notifPerm = getNotifPermission();
		} catch {
			notifPerm = 'unsupported';
		}
	}

	$effect(() => {
		if (sheet === 'notif') {
			refreshNotifPerm();
			pushState().then((s) => (pushSt = s)).catch(() => (pushSt = 'off'));
		}
	});

	async function togglePush() {
		if (pushBusy) return;
		pushBusy = true;
		try {
			if (pushSt === 'on') {
				const res = await unsubscribePush();
				if (res.ok) {
					pushSt = 'off';
					toast.success('Push kikapcsolva ezen az eszközön');
				} else {
					toast.error('Nem sikerült', res.error);
				}
			} else {
				const res = await subscribePush();
				if (res.ok) {
					pushSt = 'on';
					refreshNotifPerm();
					toast.success('Push bekapcsolva', 'Zárt appnál is értesítünk a tantermi dolgokról.');
				} else {
					if (pushSt !== 'denied') pushSt = await pushState().catch(() => pushSt);
					toast.error('Nem sikerült', res.error);
				}
			}
		} finally {
			pushBusy = false;
		}
	}

	function pushLabel(): string {
		if (pushSt === 'on') return 'Bekapcsolva ezen az eszközön';
		if (pushSt === 'denied') return 'Letiltva a böngészőben';
		if (pushSt === 'unsupported') return 'Ez a böngésző nem támogatja';
		return 'Kikapcsolva';
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
		}
	}

	$effect(() => {
		// Kijelzo azonnal, tarolas debounce-szal: csuszkahuzas kozben
		// nem irunk szinkron localStorage-t minden kepkockanal.
		const snapshot = $state.snapshot(settings);
		applyDisplaySettings(snapshot);
		const t = setTimeout(() => saveSettings(snapshot), 250);
		return () => clearTimeout(t);
	});

	$effect(() => {
		if (sheet === 'storage') refreshStorageInfo();
	});

	let notifOn = $derived(
		[settings.reminder, settings.pushClassMessage, settings.pushClassTask, settings.pushFeatures, settings.dueSoon].filter(
			Boolean
		).length
	);
	let notifSummary = $derived(
		!canNotifySafe()
			? 'Engedélyezd az értesítéseket'
			: notifOn === 5
				? 'Mind bekapcsolva'
				: notifOn === 0
					? 'Kikapcsolva'
					: `${notifOn}/5 bekapcsolva`
	);
	function canNotifySafe(): boolean {
		try {
			return canNotify();
		} catch {
			return false;
		}
	}
	let cardsSummary = $derived(
		`Gyors kvíz: ${settings.quickQuizCount} kérdés · ${settings.autoAudio ? 'automata felolvasás' : 'gombnyomásra olvas fel'}`
	);
	let themeLabel = $derived(
		theme.choice === 'light' ? 'Világos' : theme.choice === 'dark' ? 'Sötét' : 'Rendszer'
	);
	function fontFamilyLabel(f: string): string {
		return f === 'modern' ? 'Modern' : f === 'book' ? 'Könyvszerű' : 'Rendszer';
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
	<button
		onclick={() => (sheet = 'cards')}
		class="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:active:bg-white/10 dark:hover:bg-white/5"
	>
		<span class={tile}>
			<Layers size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Gyakorlás</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{cardsSummary}</span>
		</span>
		<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
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
						<button
							type="button"
							onclick={() => {
								emailDraft = user?.email ?? '';
								accountEdit = 'email';
							}}
							class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-white/5 dark:active:bg-white/10"
						>
							<Mail size={18} class="shrink-0 text-stone-400 dark:text-stone-500" />
							<span class="min-w-0 flex-1">
								<span class="block text-[15px] font-semibold text-ink-900 dark:text-white">E-mail cím módosítása</span>
								<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">{user.email}</span>
							</span>
							<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
						</button>
						<button
							type="button"
							onclick={() => {
								currentPassword = '';
								newPassword = '';
								confirmPassword = '';
								accountEdit = 'password';
							}}
							class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-white/5 dark:active:bg-white/10"
						>
							<KeyRound size={18} class="shrink-0 text-stone-400 dark:text-stone-500" />
							<span class="min-w-0 flex-1">
								<span class="block text-[15px] font-semibold text-ink-900 dark:text-white">Jelszó módosítása</span>
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
						A tanterem és a haladásod mentése fiókhoz kötött.
					</p>
					<button
						onclick={() => {
							sheet = null;
							authUI.show('login');
						}}
						class="mt-4 w-full rounded-full bg-brand-500 px-4 py-2.5 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99]"
					>
						Bejelentkezés
					</button>
					<button
						onclick={() => {
							sheet = null;
							authUI.show('register');
						}}
						class="mt-2 w-full rounded-full border border-stone-200 bg-white px-4 py-2.5 text-[15px] font-bold text-ink-900 transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
					>
						Regisztráció
					</button>
				{/if}
			</div>
		{:else if sheet === 'notif'}
			<ul class="mt-1 divide-y divide-stone-100 dark:divide-white/5">
				<li class="flex items-center gap-3 py-3">
					<div class="min-w-0 flex-1">
						<p class="flex items-center gap-1.5 text-[15px] font-semibold text-ink-900 dark:text-white">
							<Smartphone size={15} /> Push ezen az eszközön
						</p>
						<p class="text-[13px] text-ink-400 dark:text-stone-500">
							{pushLabel()}. Zárt appnál is jelez a tantermi üzenetről, feladatról és jegyről.
						</p>
					</div>
					{#if pushSt === 'on'}
						<button
							type="button"
							onclick={togglePush}
							disabled={pushBusy}
							class="shrink-0 rounded-full border border-stone-200 px-3.5 py-2 text-[13px] font-bold text-ink-600 transition hover:bg-stone-50 active:scale-95 disabled:opacity-60 dark:border-white/15 dark:text-stone-300 dark:hover:bg-white/10"
						>
							{pushBusy ? '…' : 'Kikapcsolom'}
						</button>
					{:else}
						<button
							type="button"
							onclick={togglePush}
							disabled={pushBusy || pushSt === 'unsupported' || pushSt === 'denied'}
							class="shrink-0 rounded-full bg-brand-500 px-3.5 py-2 text-[13px] font-bold text-white transition hover:bg-brand-600 active:scale-95 disabled:opacity-60"
						>
							{pushBusy ? '…' : 'Bekapcsolom'}
						</button>
					{/if}
				</li>
				<li class="flex items-center gap-2.5 py-3">
					<div class="min-w-0 flex-1">
						<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Napi emlékeztető</p>
						<p class="text-[13px] text-ink-400 dark:text-stone-500">Minden nap a beállított időpontban</p>
					</div>
					<input
						type="time"
						value={settings.reminderTime}
						onchange={onReminderTime}
						disabled={!settings.reminder}
						aria-label="Emlékeztető időpontja"
						class="w-[118px] shrink-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-center text-[15px] font-semibold text-ink-900 tabular-nums outline-none transition [color-scheme:light] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
					/>
					<Toggle bind:checked={settings.reminder} label="Napi emlékeztető" />
				</li>
				<li class="flex items-center gap-3 py-3">
					<div class="min-w-0 flex-1">
						<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Határidő-emlékeztető</p>
						<p class="text-[13px] text-ink-400 dark:text-stone-500">24 órával a lejárat előtt jelez</p>
					</div>
					<Toggle bind:checked={settings.dueSoon} label="Határidő-emlékeztető" />
				</li>
				<li class="flex items-center gap-3 py-3">
					<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Új tantermi üzenet</p>
					<Toggle bind:checked={settings.pushClassMessage} label="Új tantermi üzenet" />
				</li>
				<li class="flex items-center gap-3 py-3">
					<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Új tantermi feladat</p>
					<Toggle bind:checked={settings.pushClassTask} label="Új tantermi feladat" />
				</li>
				<li class="flex items-center gap-3 py-3">
					<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Új funkciók</p>
					<Toggle bind:checked={settings.pushFeatures} label="Új funkciók" />
				</li>
				<li class="py-3">
					<div class="flex items-center gap-3">
						<div class="min-w-0 flex-1">
							<p class="flex items-center gap-1.5 text-[15px] font-semibold text-ink-900 dark:text-white">
								<BellOff size={15} /> Némított osztályok
							</p>
							<p class="text-[13px] text-ink-400 dark:text-stone-500">
								{#if settings.mutedClassrooms.length === 0}
									Nincs némítva egy osztály sem.
								{:else}
									{settings.mutedClassrooms.length} osztály némítva. Az osztály oldalán, a cím melletti csengővel oldhatod fel.
								{/if}
							</p>
						</div>
						{#if settings.mutedClassrooms.length > 0}
							<button
								type="button"
								onclick={unmuteAll}
								class="shrink-0 rounded-full border border-stone-200 px-3.5 py-2 text-[13px] font-bold text-ink-600 dark:border-white/15 dark:text-stone-300"
							>
								Mind feloldom
							</button>
						{/if}
					</div>
					{#if settings.mutedClassrooms.length > 0}
						<ul class="mt-2 grid gap-1.5">
							{#each settings.mutedClassrooms as id (id)}
								<li class="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/5">
									<span class="min-w-0 flex-1 truncate font-mono text-[12px] text-stone-500 dark:text-stone-400">{id}</span>
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
				</li>
			</ul>
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
		{:else if sheet === 'cards'}
			<ul class="mt-1 divide-y divide-stone-100 dark:divide-white/5">
				<li class="flex items-center gap-3 py-3">
					<div class="min-w-0 flex-1">
						<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Gyors kvíz kérdésszáma</p>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						<button
							type="button"
							onclick={() => (settings.quickQuizCount = Math.max(1, settings.quickQuizCount - 1))}
							aria-label="Eggyel kevesebb"
							class="grid size-9 place-items-center rounded-full border border-stone-200 text-lg font-bold text-ink-600 transition hover:bg-stone-50 active:scale-95 dark:border-white/15 dark:text-stone-300 dark:hover:bg-white/10"
						>
							−
						</button>
						<span class="w-8 text-center text-[15px] font-extrabold text-ink-900 tabular-nums dark:text-white">
							{settings.quickQuizCount}
						</span>
						<button
							type="button"
							onclick={() => (settings.quickQuizCount = Math.min(50, settings.quickQuizCount + 1))}
							aria-label="Eggyel több"
							class="grid size-9 place-items-center rounded-full border border-stone-200 text-lg font-bold text-ink-600 transition hover:bg-stone-50 active:scale-95 dark:border-white/15 dark:text-stone-300 dark:hover:bg-white/10"
						>
							+
						</button>
					</div>
				</li>
				<li class="flex items-center gap-3 py-3">
					<div class="min-w-0 flex-1">
						<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Automatikus felolvasás</p>
						<p class="text-[13px] text-ink-400 dark:text-stone-500">Forgatás után felolvassa az idegen szót</p>
					</div>
					<Toggle bind:checked={settings.autoAudio} label="Automatikus felolvasás" />
				</li>
			</ul>
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
						A beállításaid és a témád megmaradnak ürítéskor is.
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
		{/if}
</Drawer>

<!-- Uj drawer: nev es jelszo modositas -->
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
	{:else if accountEdit === 'email'}
		<form onsubmit={saveEmail} class="mt-3 space-y-3.5" novalidate>
			<div>
				<label for="account-email" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">E-mail cím</label>
				<input
					id="account-email"
					type="email"
					autocomplete="email"
					placeholder="nev@pelda.hu"
					bind:value={emailDraft}
					disabled={busyEmail}
					class={inputCls}
				/>
				<p class="mt-1.5 text-[13px] leading-relaxed text-stone-500 dark:text-stone-400">
					Erre a címre kapsz jelszó-emlékeztetőt is.
				</p>
			</div>
			<button type="submit" disabled={busyEmail} class={primaryCls}>
				{busyEmail ? 'Mentés…' : 'E-mail cím mentése'}
			</button>
		</form>
	{:else if accountEdit === 'password'}
		<form onsubmit={savePassword} class="mt-3 space-y-3.5" novalidate>
			<div>
				<label for="account-current" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">Jelenlegi jelszó</label>
				<div class="relative">
					<input
						id="account-current"
						type={showCurrent ? 'text' : 'password'}
						autocomplete="current-password"
						placeholder="••••••••"
						bind:value={currentPassword}
						disabled={busyPass}
						class={inputCls + ' pr-11'}
					/>
					<button
						type="button"
						onclick={() => (showCurrent = !showCurrent)}
						aria-label={showCurrent ? 'Jelszó elrejtése' : 'Jelszó mutatása'}
						class="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-stone-400 transition hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:text-stone-500 dark:hover:text-white"
					>
						{#if showCurrent}<EyeOff size={19} />{:else}<Eye size={19} />{/if}
					</button>
				</div>
			</div>
			<div>
				<label for="account-new" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">Új jelszó</label>
				<div class="relative">
					<input
						id="account-new"
						type={showNew ? 'text' : 'password'}
						autocomplete="new-password"
						placeholder="Min. 8 karakter"
						bind:value={newPassword}
						disabled={busyPass}
						class={inputCls + ' pr-11'}
					/>
					<button
						type="button"
						onclick={() => (showNew = !showNew)}
						aria-label={showNew ? 'Jelszó elrejtése' : 'Jelszó mutatása'}
						class="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-stone-400 transition hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:text-stone-500 dark:hover:text-white"
					>
						{#if showNew}<EyeOff size={19} />{:else}<Eye size={19} />{/if}
					</button>
				</div>
			</div>
			<div>
				<label for="account-confirm" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">Új jelszó újra</label>
				<input
					id="account-confirm"
					type={showNew ? 'text' : 'password'}
					autocomplete="new-password"
					placeholder="Ismételd meg"
					bind:value={confirmPassword}
					disabled={busyPass}
					class={inputCls}
				/>
			</div>
			<button type="submit" disabled={busyPass} class={primaryCls}>
				{busyPass ? 'Mentés…' : 'Jelszó cseréje'}
			</button>
		</form>
	{/if}
</Drawer>

<WhatsNew open={whatsNewOpen} onClose={() => (whatsNewOpen = false)} />

<ConfirmDialog
	open={deleteAccountOpen}
	title="Fiók törlése"
	description="A haladásod, kártyáid, beküldéseid és tagságaid végleg törlődnek. Teli saját osztály esetén előbb azt töröld. Ez nem vonható vissza."
	confirmLabel="Törlöm a fiókom"
	busy={deleteAccountBusy}
	onClose={() => {
		if (!deleteAccountBusy) deleteAccountOpen = false;
	}}
	onConfirm={deleteAccount}
/>
